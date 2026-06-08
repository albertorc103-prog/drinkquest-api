import { ProfileVisibility } from '@prisma/client';
import { AuthProfileDto } from '../dto/auth-profile.dto';

type ProfileRow =
  | {
      displayName: string;
      bio: string | null;
      avatarUrl: string | null;
      profileVisibility: ProfileVisibility;
      totalXp: number;
      level: number;
      emailVerified: boolean;
    }
  | {
      id: string;
      displayName: string;
      profileVisibility: ProfileVisibility | string;
    };

export function toAuthProfileDto(row: ProfileRow): AuthProfileDto {
  if (!('bio' in row)) {
    return {
      displayName: row.displayName,
      bio: null,
      avatarUrl: null,
      profileVisibility: ProfileVisibility.PRIVATE,
      totalXp: 0,
      level: 1,
      emailVerified: false,
    };
  }
  return {
    displayName: row.displayName,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    profileVisibility: row.profileVisibility,
    totalXp: row.totalXp,
    level: row.level,
    emailVerified: row.emailVerified,
  };
}
