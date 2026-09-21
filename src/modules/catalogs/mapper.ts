import { catalogRepository } from "./repo.js";

type CourtRecord = NonNullable<Awaited<ReturnType<typeof catalogRepository.findCourt>>>;
type OfficeRecord = NonNullable<Awaited<ReturnType<typeof catalogRepository.findOffice>>>;

export function toCourtDto(court: CourtRecord) {
  return {
    id: court.id,
    name: court.name,
    jurisdiction: court.jurisdiction,
    address: court.address,
    isActive: court.isActive,
    createdAt: court.createdAt,
    updatedAt: court.updatedAt,
    offices: court.offices.map(({ managementOffice }) => ({
      id: managementOffice.id,
      name: managementOffice.name,
      address: managementOffice.address,
      isActive: managementOffice.isActive
    }))
  };
}

export function toOfficeDto(office: OfficeRecord) {
  return {
    id: office.id,
    name: office.name,
    address: office.address,
    isActive: office.isActive,
    createdAt: office.createdAt,
    updatedAt: office.updatedAt,
    courts: office.courts.map(({ court }) => ({
      id: court.id,
      name: court.name,
      jurisdiction: court.jurisdiction,
      address: court.address,
      isActive: court.isActive
    }))
  };
}
