import { ProfileVisibility } from '@prisma/client';
import { toAuthProfileDto } from './auth-profile.mapper';

describe('toAuthProfileDto', () => {
  it('maps full profile', () => {
    const dto = toAuthProfileDto({
      displayName: 'Test',
      bio: 'bio',
      avatarUrl: null,
      profileVisibility: ProfileVisibility.PUBLIC,
      totalXp: 10,
      level: 2,
      emailVerified: true,
    });
    expect(dto.displayName).toBe('Test');
    expect(dto.level).toBe(2);
  });

  it('maps private stub', () => {
    const dto = toAuthProfileDto({
      id: '1',
      displayName: 'Hidden',
      profileVisibility: 'PRIVATE',
    });
    expect(dto.profileVisibility).toBe(ProfileVisibility.PRIVATE);
    expect(dto.totalXp).toBe(0);
  });
});
