import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { UserRole } from '../common/entities/enums';
import { EmailService } from '../email/email.service';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { LoginDto, RequestPasswordResetDto, ResetPasswordDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(
        refreshToken,
        {
          secret: this.config.get<string>(
            'JWT_REFRESH_SECRET',
            'change-me-too',
          ),
        },
      );
      const user = await this.usersService.getById(payload.sub);
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const user = await this.usersService.findByEmail(dto.email.trim().toLowerCase());
    if (!user || !user.isActive || user.role !== UserRole.Doctor) {
      return { ok: true };
    }

    const token = randomBytes(32).toString('base64url');
    const expiresMinutes = this.config.get<number>('PASSWORD_RESET_EXPIRES_MINUTES', 30);
    user.passwordResetTokenHash = this.hashResetToken(token);
    user.passwordResetExpiresAtMs = Date.now() + expiresMinutes * 60 * 1000;
    await this.usersService.save(user);

    void this.emailService.sendPasswordResetEmail({
      email: user.email,
      firstName: user.doctorProfile?.firstName,
      lastName: user.doctorProfile?.lastName,
      resetToken: token,
      expiresMinutes,
    });

    return { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashResetToken(dto.token);
    const user = await this.usersService.findByPasswordResetTokenHash(tokenHash);
    if (!user || !user.passwordResetExpiresAtMs || Number(user.passwordResetExpiresAtMs) < Date.now()) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    if (!user.isActive || user.role !== UserRole.Doctor) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    user.passwordHash = await bcrypt.hash(dto.password, 12);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAtMs = null;
    await this.usersService.save(user);
    return { ok: true };
  }

  private async issueTokens(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET', 'change-me-too'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    const { passwordHash: _passwordHash, ...safeUser } = user;
    return { accessToken, refreshToken, user: safeUser };
  }

  private hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
