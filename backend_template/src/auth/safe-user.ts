import { User } from '../users/user.entity';

export type SafeAuthUser = {
  id: string;
  email: string;
  role: User['role'];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  doctorProfile?: {
    id: string;
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    fiscalNumber: string;
    specialty?: string;
    facility?: string;
    rating?: number;
    cnamCode?: string;
    gsm?: string;
    address?: string;
    city?: string;
    status: string;
  };
};

/**
 * Serialize only fields that are safe for a browser client.
 * Password hashes and password-reset material must never cross the API boundary.
 */
export function toSafeAuthUser(user: User): SafeAuthUser {
  const profile = user.doctorProfile;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ...(profile
      ? {
          doctorProfile: {
            id: profile.id,
            userId: profile.userId,
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email,
            phone: profile.phone,
            fiscalNumber: profile.fiscalNumber,
            specialty: profile.specialty,
            facility: profile.facility,
            rating: profile.rating,
            cnamCode: profile.cnamCode,
            gsm: profile.gsm,
            address: profile.address,
            city: profile.city,
            status: profile.status,
          },
        }
      : {}),
  };
}
