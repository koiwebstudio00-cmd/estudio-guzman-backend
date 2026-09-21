import { roleRepository } from "./repo.js";

export type RoleRecord = NonNullable<Awaited<ReturnType<typeof roleRepository.findById>>>;

export function toRoleDto(role: RoleRecord) {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    userCount: role._count.users,
    permissions: role.permissions.map(({ permission }) => ({
      id: permission.id,
      code: permission.code,
      description: permission.description
    })).sort((first, second) => first.code.localeCompare(second.code)),
    createdAt: role.createdAt,
    updatedAt: role.updatedAt
  };
}
