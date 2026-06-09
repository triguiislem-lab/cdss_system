import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../common/entities/enums';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  findByEmail(email: string) {
    return this.usersRepository.findOne({
      where: { email },
      relations: { doctorProfile: true },
    });
  }

  findById(id: string) {
    return this.usersRepository.findOne({
      where: { id },
      relations: { doctorProfile: true },
    });
  }

  findByPasswordResetTokenHash(passwordResetTokenHash: string) {
    return this.usersRepository.findOne({
      where: { passwordResetTokenHash },
      relations: { doctorProfile: true },
    });
  }

  async getById(id: string) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  create(email: string, passwordHash: string, role: UserRole) {
    const user = this.usersRepository.create({ email, passwordHash, role });
    return this.usersRepository.save(user);
  }

  save(user: User) {
    return this.usersRepository.save(user);
  }
}
