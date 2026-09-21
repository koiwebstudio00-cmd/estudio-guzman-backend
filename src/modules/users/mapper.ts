import { userRepository } from "./repo.js";

export type UserRecord = NonNullable<Awaited<ReturnType<typeof userRepository.findById>>>;

export function toUserDto(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    status: user.status,
    version: user.version,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    role: {
      id: user.role.id,
      code: user.role.code,
      name: user.role.name
    },
    permissions: user.role.permissions.map(({ permission }) => permission.code).sort()
  };
}
