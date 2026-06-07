import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { User } from '../users/user.entity';
import { DoctorProfile } from './doctor-profile.entity';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';
import { PublicDoctorsController } from './public-doctors.controller';

@Module({
  imports: [EmailModule, TypeOrmModule.forFeature([DoctorProfile, User])],
  controllers: [DoctorsController, PublicDoctorsController],
  providers: [DoctorsService],
  exports: [DoctorsService, TypeOrmModule],
})
export class DoctorsModule {}
