param(
    [string]$InputPath = "final_data_release\final_evidence_sections.jsonl",
    [string]$OutputPath = "final_data_release\final_evidence_sections_runtime.jsonl"
)

$ErrorActionPreference = "Stop"

function Get-MojibakeScore {
    param([AllowNull()][string]$Text)
    if ($null -eq $Text) {
        return 0
    }
    $score = 0
    foreach ($code in @(0x00C3, 0x00C2)) {
        $needle = [string][char]$code
        $score += ([regex]::Matches($Text, [regex]::Escape($needle))).Count
    }
    return $score
}

function Repair-Mojibake {
    param([AllowNull()][string]$Text)
    if ($null -eq $Text) {
        return ""
    }
    $beforeScore = Get-MojibakeScore $Text
    if ($beforeScore -eq 0) {
        return $Text
    }
    try {
        $latin1 = [System.Text.Encoding]::GetEncoding(1252)
        $utf8 = [System.Text.Encoding]::UTF8
        $candidate = $utf8.GetString($latin1.GetBytes($Text))
        if ((Get-MojibakeScore $candidate) -lt $beforeScore -and $candidate.IndexOf([string][char]0xFFFD) -lt 0) {
            return $candidate
        }
    }
    catch {
        return $Text
    }
    return $Text
}

function Normalize-ClinicalText {
    param([AllowNull()][string]$Text)
    if ($null -eq $Text) {
        return ""
    }
    $value = Repair-Mojibake $Text
    $value = $value -replace "`0", " "
    $value = $value -replace [string][char]0xFFFD, " "
    $value = $value -replace "\s+", " "
    return $value.Trim()
}

function Get-AuthorityClass {
    param($Item)
    $qualityFlags = [string]$Item.quality_flags
    $authority = [string]$Item.authority_level
    $source = [string]$Item.source_system

    if ($qualityFlags -match "support_only|brand_query_support_source_needs_review") {
        return "support_only"
    }
    if ($authority -match "^local_" -or $source -match "^tunisia_") {
        return "local_official_or_local_document"
    }
    if ($authority -match "bdpm|smpc|aemps|swissmedic|who|cecmed|dailymed|openfda") {
        return "regulatory_label_or_reference"
    }
    return "general_evidence"
}

$resolvedInput = Resolve-Path $InputPath
$outputFullPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPath))
$outputDir = Split-Path -Parent $outputFullPath
if (!(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$reader = [System.IO.File]::OpenText($resolvedInput)
$writer = New-Object System.IO.StreamWriter($outputFullPath, $false, [System.Text.UTF8Encoding]::new($false))
$count = 0
$changedText = 0
$mojibakeRepaired = 0
$duplicateSafe = 0
$seen = New-Object 'System.Collections.Generic.HashSet[string]'

try {
    while ($null -ne ($line = $reader.ReadLine())) {
        if (-not $line.Trim()) {
            continue
        }
        $item = $line | ConvertFrom-Json
        $uidParts = @(
            [string]$item.row_id,
            [string]$item.section_id,
            [string]$item.source_system,
            [string]$item.content_hash
        )
        $evidenceUid = ($uidParts -join "|")
        if (-not $seen.Add($evidenceUid)) {
            $duplicateSafe++
            $evidenceUid = "$evidenceUid|dup$duplicateSafe"
        }

        $titleNormalized = Normalize-ClinicalText $item.section_title
        $textNormalized = Normalize-ClinicalText $item.section_text
        if ($titleNormalized -ne [string]$item.section_title -or $textNormalized -ne [string]$item.section_text) {
            $changedText++
        }
        if ((Get-MojibakeScore ([string]$item.section_title)) -gt (Get-MojibakeScore $titleNormalized) -or
            (Get-MojibakeScore ([string]$item.section_text)) -gt (Get-MojibakeScore $textNormalized)) {
            $mojibakeRepaired++
        }

        $item | Add-Member -NotePropertyName evidence_uid -NotePropertyValue $evidenceUid -Force
        $item | Add-Member -NotePropertyName original_section_id -NotePropertyValue ([string]$item.section_id) -Force
        $item | Add-Member -NotePropertyName section_title_normalized -NotePropertyValue $titleNormalized -Force
        $item | Add-Member -NotePropertyName section_text_normalized -NotePropertyValue $textNormalized -Force
        $item | Add-Member -NotePropertyName authority_class -NotePropertyValue (Get-AuthorityClass $item) -Force
        $item | Add-Member -NotePropertyName runtime_safe_transform -NotePropertyValue "non_destructive_added_uid_normalized_text_authority_class" -Force

        $writer.WriteLine(($item | ConvertTo-Json -Compress -Depth 8))
        $count++
    }
}
finally {
    $reader.Close()
    $writer.Close()
}

[pscustomobject]@{
    input = $InputPath
    output = $OutputPath
    rows_written = $count
    normalized_text_rows = $changedText
    mojibake_repaired_rows = $mojibakeRepaired
    duplicate_evidence_uid_rows = $duplicateSafe
}
