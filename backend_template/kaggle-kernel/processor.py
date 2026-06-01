from pathlib import Path
import gc
import importlib.util
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import wave
import zipfile


INPUT_ROOT = Path("/kaggle/input")
WORKING = Path("/kaggle/working")
WORK_DIR = WORKING / "cdss_audio_work"
WORK_DIR.mkdir(parents=True, exist_ok=True)
MODEL_CACHE_DIR = Path(os.environ.get("ASR_MODEL_CACHE_DIR", "/kaggle/temp/cdss_audio_models"))

ASR_PRIMARY_ENGINE = os.environ.get("ASR_PRIMARY_ENGINE", "linto").lower()
ASR_ALLOW_WHISPER_FALLBACK = os.environ.get("ASR_ALLOW_WHISPER_FALLBACK", "true").lower() == "true"
ASR_MODEL_SIZE = os.environ.get("ASR_MODEL_SIZE", "medium")
ASR_LANGUAGE = os.environ.get("ASR_LANGUAGE") or None
ASR_BEAM_SIZE = int(os.environ.get("ASR_BEAM_SIZE", "5"))
ASR_VAD_FILTER = os.environ.get("ASR_VAD_FILTER", "false").lower() == "true"
ASR_CONDITION_ON_PREVIOUS_TEXT = False
ASR_INITIAL_PROMPT = None

LINTO_MODEL_REPO = os.environ.get("LINTO_MODEL_REPO", "linagora/linto-asr-ar-tn-0.1")
LINTO_MODEL_VARIANT = os.environ.get("LINTO_MODEL_VARIANT", "vosk-model")
LINTO_MODEL_DIR = os.environ.get("LINTO_MODEL_DIR") or None
LINTO_MODEL_ZIP = os.environ.get("LINTO_MODEL_ZIP") or None
LINTO_ENABLE_DOWNLOAD = os.environ.get("LINTO_ENABLE_DOWNLOAD", "true").lower() == "true"
LINTO_MIN_CONFIDENCE = float(os.environ.get("LINTO_MIN_CONFIDENCE", "0.45"))
LINTO_MIN_USABLE_CONFIDENCE = float(os.environ.get("LINTO_MIN_USABLE_CONFIDENCE", "0.25"))
LINTO_MIN_WORDS = int(os.environ.get("LINTO_MIN_WORDS", "3"))
LINTO_MIN_WORDS_PER_MINUTE = float(os.environ.get("LINTO_MIN_WORDS_PER_MINUTE", "30"))
LINTO_WORD_DENSITY_MIN_DURATION = float(os.environ.get("LINTO_WORD_DENSITY_MIN_DURATION", "20"))
WHISPER_LENGTH_DOMINANCE_RATIO = float(os.environ.get("WHISPER_LENGTH_DOMINANCE_RATIO", "2.5"))


def run(cmd, check=True):
    print("$", " ".join(map(str, cmd)) if isinstance(cmd, list) else cmd)
    return subprocess.run(cmd, check=check, text=True)


def has_module(module_name):
    return importlib.util.find_spec(module_name) is not None


def install_missing(module_packages):
    packages = [package for module, package in module_packages if not has_module(module)]
    if not packages:
        return

    run([
        sys.executable,
        "-m",
        "pip",
        "install",
        "-q",
        "--upgrade",
        *packages,
    ], check=False)


def ensure_linto_dependency():
    install_missing([("vosk", "vosk")])


def ensure_whisper_dependency():
    install_missing([("faster_whisper", "faster-whisper")])


def ensure_dependencies():
    if ASR_PRIMARY_ENGINE == "whisper":
        ensure_whisper_dependency()
    else:
        ensure_linto_dependency()


def find_manifest():
    manifests = sorted(INPUT_ROOT.rglob("manifest.json"))
    if not manifests:
        raise FileNotFoundError("No manifest.json found under /kaggle/input")
    return manifests[0]


def load_audio_from_manifest(manifest):
    dataset_dir = manifest["_manifest_path"].parent
    audio_file = manifest.get("audio_file")
    latest_id = manifest.get("latest_consultation_id")

    if latest_id and isinstance(manifest.get("consultations"), list):
        for item in manifest["consultations"]:
            if item.get("consultation_id") == latest_id and item.get("audio_file"):
                audio_file = item["audio_file"]
                break

    if audio_file:
        candidate = dataset_dir / audio_file
        if candidate.exists():
            return candidate

    audio_files = []
    for ext in ("*.mp3", "*.wav", "*.m4a", "*.webm", "*.ogg", "*.flac"):
        audio_files.extend(dataset_dir.rglob(ext))
    if not audio_files:
        raise FileNotFoundError(f"No audio file found in {dataset_dir}")
    return sorted(audio_files)[0]


def ffprobe_duration(path):
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        return float(result.stdout.strip())
    except Exception:
        return None


def convert_to_16k_wav(audio_path):
    wav_path = WORK_DIR / f"{audio_path.stem}_16k.wav"
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(audio_path),
        "-ar",
        "16000",
        "-ac",
        "1",
        "-vn",
        str(wav_path),
    ]
    subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    return wav_path


PROMPT_LEAK_PHRASES = [
    "transcribe accurately, including symptoms",
    "this is a medical conversation between a doctor and a patient",
]


def looks_like_prompt_leak(text):
    lower = text.lower()
    return any(lower.count(phrase) >= 1 for phrase in PROMPT_LEAK_PHRASES) and len(lower.split()) < 80


def is_vosk_model_dir(path):
    path = Path(path)
    if not path.is_dir():
        return False
    markers = [path / "am", path / "conf", path / "graph"]
    return sum(1 for marker in markers if marker.exists()) >= 2


def find_vosk_model_dir(root):
    root = Path(root)
    if not root.exists():
        return None
    if is_vosk_model_dir(root):
        return root
    for candidate in root.rglob("*"):
        if is_vosk_model_dir(candidate):
            return candidate
    return None


def safe_extract_zip(zip_path, target_dir):
    target_dir = Path(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    target_root = target_dir.resolve()
    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.infolist():
            member_path = (target_root / member.filename).resolve()
            if target_root != member_path and target_root not in member_path.parents:
                raise ValueError(f"Unsafe zip member path: {member.filename}")
        archive.extractall(target_dir)


def extract_linto_model_zip(zip_path):
    zip_path = Path(zip_path)
    MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    extract_dir = MODEL_CACHE_DIR / f"{zip_path.stem}_extracted"
    model_dir = find_vosk_model_dir(extract_dir)
    if model_dir:
        return model_dir

    print("Extracting LinTO Vosk model:", zip_path)
    safe_extract_zip(zip_path, extract_dir)
    model_dir = find_vosk_model_dir(extract_dir)
    if not model_dir:
        raise FileNotFoundError(f"No Vosk model directory found after extracting {zip_path}")
    return model_dir


def search_attached_linto_model():
    if LINTO_MODEL_DIR:
        model_dir = find_vosk_model_dir(LINTO_MODEL_DIR)
        if model_dir:
            return model_dir
        raise FileNotFoundError(f"LINTO_MODEL_DIR is set but no Vosk model was found: {LINTO_MODEL_DIR}")

    if LINTO_MODEL_ZIP:
        return extract_linto_model_zip(LINTO_MODEL_ZIP)

    if not INPUT_ROOT.exists():
        return None

    for candidate in INPUT_ROOT.rglob(LINTO_MODEL_VARIANT):
        model_dir = find_vosk_model_dir(candidate)
        if model_dir:
            return model_dir

    for candidate in INPUT_ROOT.rglob(f"{LINTO_MODEL_VARIANT}.zip"):
        if candidate.is_file():
            return extract_linto_model_zip(candidate)

    return None


def download_linto_model_zip():
    if not LINTO_ENABLE_DOWNLOAD:
        raise FileNotFoundError(
            "LinTO model is not attached and LINTO_ENABLE_DOWNLOAD=false. "
            "Set LINTO_MODEL_DIR or LINTO_MODEL_ZIP, or enable Kaggle internet."
        )

    MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = MODEL_CACHE_DIR / f"{LINTO_MODEL_VARIANT}.zip"
    if zip_path.exists() and zip_path.stat().st_size > 0:
        return zip_path

    url = f"https://huggingface.co/{LINTO_MODEL_REPO}/resolve/main/{LINTO_MODEL_VARIANT}.zip"
    print("Downloading LinTO Vosk model:", url)
    urllib.request.urlretrieve(url, zip_path)
    return zip_path


def resolve_linto_model_dir():
    attached_model = search_attached_linto_model()
    if attached_model:
        return attached_model

    return extract_linto_model_zip(download_linto_model_zip())


def average_word_confidence(words):
    confidences = []
    for word in words:
        try:
            confidences.append(float(word["conf"]))
        except Exception:
            pass
    if not confidences:
        return None
    return sum(confidences) / len(confidences)


def load_linto_model():
    ensure_linto_dependency()
    from vosk import Model

    start = time.time()
    model_dir = resolve_linto_model_dir()
    print("Loading LinTO/Vosk model:", model_dir)
    model = Model(str(model_dir))
    return model, model_dir, time.time() - start


def transcribe_linto_audio(model, wav_path, model_dir, model_load_seconds):
    from vosk import KaldiRecognizer

    start = time.time()
    segments = []
    all_words = []

    def add_result(raw_result):
        parsed = json.loads(raw_result or "{}")
        text = (parsed.get("text") or "").strip()
        words = parsed.get("result") or []
        if not text:
            return

        segment = {"text": text}
        if words:
            segment["start"] = float(words[0].get("start", 0))
            segment["end"] = float(words[-1].get("end", 0))
            segment_confidence = average_word_confidence(words)
            if segment_confidence is not None:
                segment["confidence"] = segment_confidence
            all_words.extend(words)
        segments.append(segment)

    with wave.open(str(wav_path), "rb") as wf:
        if wf.getnchannels() != 1 or wf.getsampwidth() != 2 or wf.getcomptype() != "NONE":
            raise ValueError("LinTO/Vosk expects WAV format mono PCM.")

        sample_rate = wf.getframerate()
        duration = wf.getnframes() / float(sample_rate or 1)
        recognizer = KaldiRecognizer(model, sample_rate)
        recognizer.SetWords(True)

        while True:
            data = wf.readframes(4000)
            if not data:
                break
            if recognizer.AcceptWaveform(data):
                add_result(recognizer.Result())
        add_result(recognizer.FinalResult())

    text = " ".join(item["text"] for item in segments).strip()
    confidence = average_word_confidence(all_words)
    return {
        "engine": "linto_vosk",
        "model": LINTO_MODEL_REPO,
        "model_variant": LINTO_MODEL_VARIANT,
        "model_dir": str(model_dir),
        "language": "ar-tn",
        "language_probability": None,
        "duration": float(duration or 0),
        "elapsed_seconds": time.time() - start,
        "model_load_seconds": model_load_seconds,
        "segments": segments,
        "text": text,
        "word_count": len(text.split()),
        "confidence": confidence,
        "possible_prompt_leak": looks_like_prompt_leak(text),
        "settings": {
            "primary_engine": ASR_PRIMARY_ENGINE,
            "min_confidence_for_primary": LINTO_MIN_CONFIDENCE,
            "min_usable_confidence_for_primary": LINTO_MIN_USABLE_CONFIDENCE,
            "min_words_for_primary": LINTO_MIN_WORDS,
            "min_words_per_minute_for_primary": LINTO_MIN_WORDS_PER_MINUTE,
            "word_density_min_duration": LINTO_WORD_DENSITY_MIN_DURATION,
            "allow_whisper_fallback": ASR_ALLOW_WHISPER_FALLBACK,
            "download_enabled": LINTO_ENABLE_DOWNLOAD,
        },
    }


def linto_quality_issues(asr_result):
    text = (asr_result.get("text") or "").strip()
    word_count = int(asr_result.get("word_count") or len(text.split()))
    duration = float(asr_result.get("duration") or 0)
    confidence = asr_result.get("confidence")
    issues = []

    if not text:
        issues.append("empty_transcript")
    elif word_count < LINTO_MIN_WORDS:
        issues.append(f"too_few_words:{word_count}<{LINTO_MIN_WORDS}")

    if confidence is not None and word_count > 0 and confidence < LINTO_MIN_CONFIDENCE:
        issues.append(f"low_confidence:{confidence:.3f}<{LINTO_MIN_CONFIDENCE:.3f}")

    if text and duration >= LINTO_WORD_DENSITY_MIN_DURATION:
        words_per_minute = word_count / max(duration / 60, 1e-6)
        if words_per_minute < LINTO_MIN_WORDS_PER_MINUTE:
            issues.append(
                f"low_word_density:{words_per_minute:.1f}<{LINTO_MIN_WORDS_PER_MINUTE:.1f}"
            )

    if asr_result.get("possible_prompt_leak"):
        issues.append("possible_prompt_leak")

    return issues


def summarize_attempt(asr_result=None, engine=None, status="completed", error=None):
    if error:
        return {
            "engine": engine,
            "status": "error",
            "error": str(error),
        }

    return {
        "engine": asr_result.get("engine"),
        "status": status,
        "model": asr_result.get("model"),
        "model_variant": asr_result.get("model_variant"),
        "language": asr_result.get("language"),
        "word_count": asr_result.get("word_count"),
        "confidence": asr_result.get("confidence"),
        "language_probability": asr_result.get("language_probability"),
        "elapsed_seconds": asr_result.get("elapsed_seconds"),
        "quality_issues": asr_result.get("quality_issues", []),
    }


SELECTION_METADATA_KEYS = {
    "alternatives_available",
    "attempts",
    "fallback_executed",
    "fallback_reason",
    "fallback_result",
    "fallback_used",
    "final_transcript",
    "primary_engine",
    "primary_error",
    "primary_result",
    "selected_engine",
    "selection_reason",
}


def result_word_count(asr_result):
    if not asr_result:
        return 0
    text = (asr_result.get("text") or "").strip()
    return int(asr_result.get("word_count") or len(text.split()))


def result_payload(asr_result):
    if not asr_result:
        return None
    return {
        key: value
        for key, value in asr_result.items()
        if key not in SELECTION_METADATA_KEYS
    }


def finalize_single_result(
    asr_result,
    selected_engine,
    primary_engine,
    attempts,
    selection_reason,
    fallback_reason=None,
):
    final = dict(asr_result)
    final["final_transcript"] = (final.get("text") or "").strip()
    final["selected_engine"] = selected_engine
    final["primary_engine"] = primary_engine
    final["fallback_used"] = False
    final["fallback_executed"] = False
    final["fallback_reason"] = fallback_reason or []
    final["alternatives_available"] = False
    final["selection_reason"] = selection_reason
    final["attempts"] = attempts
    return final


def select_best_result(linto_result, whisper_result, fallback_reasons):
    linto_text = ((linto_result or {}).get("text") or "").strip()
    whisper_text = ((whisper_result or {}).get("text") or "").strip()
    linto_words = result_word_count(linto_result)
    whisper_words = result_word_count(whisper_result)
    linto_confidence = (linto_result or {}).get("confidence")
    linto_prompt_leak = bool((linto_result or {}).get("possible_prompt_leak"))
    whisper_prompt_leak = bool((whisper_result or {}).get("possible_prompt_leak"))
    primary_sparse = any(str(reason).startswith("low_word_density") for reason in fallback_reasons)
    selection_reason = []

    if not linto_text and whisper_text:
        selected = "whisper_fallback"
        selection_reason.append("primary_empty")
    elif linto_prompt_leak and whisper_text:
        selected = "whisper_fallback"
        selection_reason.append("primary_possible_prompt_leak")
    elif linto_text and (not whisper_text or whisper_prompt_leak):
        selected = "linto_vosk"
        selection_reason.append("fallback_empty_or_prompt_leak")
    elif linto_words < LINTO_MIN_WORDS and whisper_words >= LINTO_MIN_WORDS:
        selected = "whisper_fallback"
        selection_reason.append("primary_too_short")
    elif primary_sparse and whisper_words >= max(LINTO_MIN_WORDS, int(linto_words * 1.5)):
        selected = "whisper_fallback"
        selection_reason.append("fallback_longer_after_sparse_primary")
    elif (
        linto_confidence is not None
        and linto_confidence < LINTO_MIN_USABLE_CONFIDENCE
        and whisper_words >= max(linto_words, LINTO_MIN_WORDS)
    ):
        selected = "whisper_fallback"
        selection_reason.append("primary_below_usable_confidence")
    elif (
        linto_confidence is not None
        and linto_confidence < LINTO_MIN_CONFIDENCE
        and whisper_words >= max(LINTO_MIN_WORDS, int(linto_words * WHISPER_LENGTH_DOMINANCE_RATIO))
    ):
        selected = "whisper_fallback"
        selection_reason.append("fallback_much_longer_with_low_primary_confidence")
    else:
        selected = "linto_vosk"
        selection_reason.append("prefer_tunisian_primary")

    selected_result = whisper_result if selected == "whisper_fallback" else linto_result
    final = dict(selected_result)
    final["final_transcript"] = (final.get("text") or "").strip()
    final["selected_engine"] = selected
    final["primary_engine"] = "linto_vosk"
    final["fallback_used"] = selected == "whisper_fallback"
    final["fallback_executed"] = whisper_result is not None
    final["fallback_reason"] = fallback_reasons
    final["alternatives_available"] = bool(linto_text and whisper_text)
    final["selection_reason"] = selection_reason

    if linto_result:
        final["primary_result"] = result_payload(linto_result)
    if whisper_result:
        final["fallback_result"] = result_payload(whisper_result)

    return final


def load_whisper_model():
    ensure_whisper_dependency()
    from faster_whisper import WhisperModel

    try:
        import torch
        has_cuda = torch.cuda.is_available()
    except Exception as error:
        print("Torch CUDA check failed; using CPU:", repr(error))
        has_cuda = False

    if has_cuda:
        device = "cuda"
        compute_candidates = ["float16", "int8_float16", "float32", "int8"]
    else:
        device = "cpu"
        compute_candidates = ["float32", "int8"]

    last_error = None
    for compute_type in compute_candidates:
        try:
            print("Loading faster-whisper model:", ASR_MODEL_SIZE, device, compute_type)
            model = WhisperModel(
                ASR_MODEL_SIZE,
                device=device,
                compute_type=compute_type,
                device_index=0,
            )
            return model, device, compute_type
        except Exception as error:
            print("Whisper load failed with compute_type", compute_type, ":", repr(error))
            last_error = error

    raise last_error


def transcribe_whisper_audio(model, wav_path, device, compute_type):
    start = time.time()
    kwargs = {
        "language": ASR_LANGUAGE,
        "beam_size": ASR_BEAM_SIZE,
        "vad_filter": ASR_VAD_FILTER,
        "condition_on_previous_text": ASR_CONDITION_ON_PREVIOUS_TEXT,
        "word_timestamps": False,
        "temperature": 0.0,
    }
    if ASR_INITIAL_PROMPT:
        kwargs["initial_prompt"] = ASR_INITIAL_PROMPT

    segments_iter, info = model.transcribe(str(wav_path), **kwargs)
    segments = []
    for segment in segments_iter:
        text = (segment.text or "").strip()
        if text:
            segments.append({
                "start": float(segment.start),
                "end": float(segment.end),
                "text": text,
            })

    text = " ".join(item["text"] for item in segments).strip()
    return {
        "engine": "whisper",
        "language": info.language,
        "language_probability": float(info.language_probability or 0),
        "duration": float(info.duration or 0),
        "elapsed_seconds": time.time() - start,
        "segments": segments,
        "text": text,
        "word_count": len(text.split()),
        "confidence": None,
        "possible_prompt_leak": looks_like_prompt_leak(text),
        "settings": {
            "model": ASR_MODEL_SIZE,
            "device": device,
            "compute_type": compute_type,
            "language": ASR_LANGUAGE,
            "vad_filter": ASR_VAD_FILTER,
            "condition_on_previous_text": ASR_CONDITION_ON_PREVIOUS_TEXT,
            "initial_prompt_used": bool(ASR_INITIAL_PROMPT),
        },
    }


def run_asr_pipeline(wav_path):
    attempts = []

    if ASR_PRIMARY_ENGINE == "whisper":
        model, device, compute_type = load_whisper_model()
        whisper_result = transcribe_whisper_audio(model, wav_path, device, compute_type)
        whisper_result["quality_issues"] = []
        attempts.append(summarize_attempt(whisper_result))
        return finalize_single_result(
            whisper_result,
            selected_engine="whisper",
            primary_engine="whisper",
            attempts=attempts,
            selection_reason=["whisper_configured_as_primary"],
        )

    if ASR_PRIMARY_ENGINE != "linto":
        raise ValueError("ASR_PRIMARY_ENGINE must be 'linto' or 'whisper'")

    linto_result = None
    linto_model = None
    fallback_reasons = []
    linto_error = None

    try:
        linto_model, linto_model_dir, model_load_seconds = load_linto_model()
        linto_result = transcribe_linto_audio(linto_model, wav_path, linto_model_dir, model_load_seconds)
        fallback_reasons = linto_quality_issues(linto_result)
        linto_result["quality_issues"] = fallback_reasons
        attempts.append(summarize_attempt(linto_result))

        if not fallback_reasons or not ASR_ALLOW_WHISPER_FALLBACK:
            linto_result["fallback_reason"] = fallback_reasons
            return finalize_single_result(
                linto_result,
                selected_engine="linto_vosk",
                primary_engine="linto_vosk",
                attempts=attempts,
                selection_reason=["primary_accepted_without_fallback"],
                fallback_reason=fallback_reasons,
            )
    except Exception as error:
        linto_error = error
        fallback_reasons = [f"linto_failed:{error}"]
        attempts.append(summarize_attempt(engine="linto_vosk", error=error))

    if not ASR_ALLOW_WHISPER_FALLBACK:
        if linto_error:
            raise linto_error
        return linto_result

    linto_model = None
    gc.collect()

    try:
        model, device, compute_type = load_whisper_model()
        whisper_result = transcribe_whisper_audio(model, wav_path, device, compute_type)
        whisper_result["quality_issues"] = []
        attempts.append(summarize_attempt(whisper_result))
        selected_result = select_best_result(linto_result, whisper_result, fallback_reasons)
        selected_result["attempts"] = attempts
        if linto_error:
            selected_result["primary_error"] = str(linto_error)
        return selected_result
    except Exception as error:
        attempts.append(summarize_attempt(engine="whisper", error=error))
        if linto_result:
            linto_result["fallback_reason"] = fallback_reasons
            linto_result["fallback_error"] = str(error)
            final = finalize_single_result(
                linto_result,
                selected_engine="linto_vosk",
                primary_engine="linto_vosk",
                attempts=attempts,
                selection_reason=["fallback_failed_keep_primary"],
                fallback_reason=fallback_reasons,
            )
            final["fallback_error"] = str(error)
            return final
        raise RuntimeError(f"LinTO and Whisper failed. LinTO: {linto_error}; Whisper: {error}") from error


SYMPTOM_KEYWORDS = [
    "chest pain", "pain", "cough", "fever", "shortness of breath", "breath",
    "headache", "nausea", "vomiting", "diarrhea", "fatigue", "dizziness",
    "sore throat", "asthma", "sharp", "burning", "ache", "wheezing",
    "constant", "toux", "fievre", "fièvre", "douleur", "nausee", "nausée",
    "dyspnee", "dyspnée", "essoufflement",
]

MEDICATION_KEYWORDS = [
    "paracetamol", "acetaminophen", "ibuprofen", "amoxicillin", "salbutamol",
    "omeprazole", "antibiotic", "antibiotics", "doliprane", "ventoline",
    "metformin", "insulin", "aspirin",
]

ALLERGY_PATTERNS = [
    r"no known drug allergy",
    r"no known allergies",
    r"allerg(?:y|ic|ies)[^.?\n]*",
    r"allergique[^.?\n]*",
]

DOSAGE_PATTERNS = [
    r"\b\d+\s*(?:mg|g|ml|mcg|ug|tablet|tablets|pill|pills)\b",
    r"\b(?:once|twice|three times|four times)\s+(?:a|per)\s+day\b",
    r"\bevery\s+\d+\s+hours\b",
    r"\b\d+\s*fois\b",
]

TEMPORAL_PATTERNS = [
    r"\bfor\s+\w+\s+(?:day|days|hour|hours|week|weeks|month|months)\b",
    r"\bsince\s+[^.?\n]+",
    r"\blast night\b",
    r"\ba couple of hours\b",
    r"\b\d+\s*(?:hours|days|weeks|months)\b",
]


def find_keywords(text, keywords):
    return sorted(set(keyword for keyword in keywords if keyword in text))


def find_patterns(text, patterns):
    hits = []
    for pattern in patterns:
        for hit in re.findall(pattern, text, flags=re.IGNORECASE):
            if isinstance(hit, tuple):
                hit = " ".join(part for part in hit if part)
            hit = str(hit).strip()
            if hit:
                hits.append(hit)
    return sorted(set(hits))


def extract_medical_info(transcript_text, audio_path, asr_result):
    text_lower = transcript_text.lower()
    safety_flags = []
    if "chest pain" in text_lower or "left side of my chest" in text_lower:
        safety_flags.append("Chest pain mentioned: requires urgent clinical evaluation / physician validation.")
    if "shortness of breath" in text_lower or "dyspnea" in text_lower:
        safety_flags.append("Breathing difficulty mentioned: requires physician validation.")

    return {
        "source_audio": str(audio_path),
        "transcript_source": "ASR_NO_DIARIZATION",
        "asr_language": asr_result.get("language"),
        "patient_facts": {
            "age_mentions": find_patterns(transcript_text, [r"\b\d{1,3}\s*(?:years old|yo)?\b"]),
            "sex_mentions": find_patterns(transcript_text, [r"\bmale\b", r"\bfemale\b", r"\bman\b", r"\bwoman\b"]),
        },
        "symptoms_detected": find_keywords(text_lower, SYMPTOM_KEYWORDS),
        "medications_detected": find_keywords(text_lower, MEDICATION_KEYWORDS),
        "allergy_mentions": find_patterns(transcript_text, ALLERGY_PATTERNS),
        "dosage_or_frequency_mentions": find_patterns(transcript_text, DOSAGE_PATTERNS),
        "temporal_mentions": find_patterns(transcript_text, TEMPORAL_PATTERNS),
        "safety_flags": safety_flags,
        "requires_physician_validation": True,
        "note": "Baseline extractor for testing. Not a medical diagnosis or prescription engine.",
    }


def main():
    try:
        ensure_dependencies()

        manifest_path = find_manifest()
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["_manifest_path"] = manifest_path

        audio_path = load_audio_from_manifest(manifest)
        wav_path = convert_to_16k_wav(audio_path)
        asr_result = run_asr_pipeline(wav_path)
        final_transcript = asr_result.get("final_transcript") or asr_result["text"]
        medical_extraction = extract_medical_info(final_transcript, audio_path, asr_result)

        result = {
            "status": "completed_transcription",
            "consultation_id": manifest.get("latest_consultation_id") or manifest.get("consultation_id"),
            "audio_file": str(audio_path),
            "audio_size_bytes": audio_path.stat().st_size,
            "input_duration_seconds": ffprobe_duration(audio_path),
            "processed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "final_transcript": final_transcript,
            "transcript": final_transcript,
            "asr": asr_result,
            "medical_extraction": medical_extraction,
            "draft_prescription": None,
            "safety_validation": {
                "requires_physician_validation": True,
                "message": "Transcript and extraction are automatic and require physician validation.",
                "flags": medical_extraction["safety_flags"],
            },
        }

        (WORKING / "asr_result.json").write_text(json.dumps(asr_result, indent=2, ensure_ascii=True), encoding="utf-8")
        (WORKING / "medical_extraction.json").write_text(json.dumps(medical_extraction, indent=2, ensure_ascii=True), encoding="utf-8")
    except Exception as error:
        import traceback

        result = {
            "status": "error",
            "processed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "error": str(error),
            "traceback": traceback.format_exc(),
            "final_transcript": "",
            "transcript": "",
            "medical_extraction": None,
            "safety_validation": {
                "requires_physician_validation": True,
                "message": "Transcription failed. Review the error and retry.",
                "flags": [],
            },
        }

    (WORKING / "result.json").write_text(json.dumps(result, indent=2, ensure_ascii=True), encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
