import { getPrisma } from "../../database/prisma.js";
import {
  ActionType, AddressType, CaseStatus, CaseType, ContactCategoryType, ContactChannelType,
  ContactKind, DocumentCategory, ParticipantRole, PartySide, RepresentationType,
  SubCaseStatus, SubCaseType, TaskPriority, TaskStatus
} from "../../generated/prisma/enums.js";
import { ApiError } from "../../shared/http/errors.js";
import { normalizeSearch } from "../../shared/validation/normalize.js";
import { auditService } from "../audit/service.js";
import type { AuthenticatedActor, RequestContext } from "../auth/types.js";
import { outboxService } from "../outbox/service.js";
import { toCourtDto, toOfficeDto } from "./mapper.js";
import { catalogRepository } from "./repo.js";

const localized: Record<string, string> = {
  PERSON: "Persona", ORGANIZATION: "Organización", CLIENT: "Cliente", LAWYER: "Abogado/a",
  COMPANY: "Empresa", REPRESENTATIVE: "Representante", EXPERT: "Perito", WITNESS: "Testigo",
  JUDICIAL_CONTACT: "Contacto judicial", POLICE: "Policía", OTHER: "Otro", EMAIL: "Email",
  PHONE: "Teléfono", WHATSAPP: "WhatsApp", HOME: "Particular", WORK: "Laboral", LEGAL: "Legal",
  LABOR: "Laboral", CIVIL_COMMERCIAL: "Civil y comercial", CRIMINAL: "Penal", FAMILY: "Familia",
  PENDING: "Pendiente", ACTIVE: "Activo", SUSPENDED: "Suspendido", CLOSED: "Cerrado", ARCHIVED: "Archivado",
  CLAIMANT: "Actor/a", DEFENDANT: "Demandado/a", THIRD_PARTY: "Tercero", COMPLAINANT: "Denunciante",
  ACCUSED: "Imputado/a", VICTIM: "Víctima", OUR_SIDE: "Nuestra parte", COUNTERPART: "Contraparte",
  NEUTRAL: "Neutral", ATTORNEY: "Patrocinio letrado", LEGAL_REPRESENTATIVE: "Representación legal",
  POWER_OF_ATTORNEY: "Poder", EVIDENCE: "Prueba", INCIDENT: "Incidente", RESOLVED: "Resuelto",
  CLAIM: "Demanda", ANSWER: "Contestación", NOTICE: "Cédula/aviso", DECREE: "Decreto",
  RESOLUTION: "Resolución", FILING: "Presentación", OFFICIAL_LETTER: "Oficio", NOTIFICATION: "Notificación",
  IN_PROGRESS: "En curso", COMPLETED: "Completada", CANCELLED: "Cancelada", LOW: "Baja",
  MEDIUM: "Media", HIGH: "Alta", URGENT: "Urgente", PLEADING: "Escrito", COURT_ORDER: "Resolución judicial",
  IDENTITY: "Identidad", INTERNAL: "Interno"
};

const options = (values: Record<string, string>) => Object.values(values).map((value) => ({ value, label: localized[value] ?? value }));
const requestMetadata = (context: RequestContext) => ({ ...(context.requestId ? { requestId: context.requestId } : {}), ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}), ...(context.userAgent ? { userAgent: context.userAgent } : {}) });

export class CatalogService {
  enums() {
    return {
      contactKinds: options(ContactKind), contactCategories: options(ContactCategoryType), contactChannels: options(ContactChannelType),
      addressTypes: options(AddressType), caseTypes: options(CaseType), caseStatuses: options(CaseStatus),
      participantRoles: options(ParticipantRole), partySides: options(PartySide), representationTypes: options(RepresentationType),
      subCaseTypes: options(SubCaseType), subCaseStatuses: options(SubCaseStatus), actionTypes: options(ActionType),
      taskStatuses: options(TaskStatus), taskPriorities: options(TaskPriority), documentCategories: options(DocumentCategory)
    };
  }

  async courts(filters: { q?: string | undefined; active?: boolean | undefined }) {
    const values = await catalogRepository.listCourts(getPrisma(), { ...(filters.q ? { q: normalizeSearch(filters.q) } : {}), ...(filters.active !== undefined ? { active: filters.active } : {}) });
    return values.map(toCourtDto);
  }

  async court(id: string) {
    const value = await catalogRepository.findCourt(getPrisma(), id);
    if (!value) throw new ApiError("NOT_FOUND", "Juzgado no encontrado.");
    return toCourtDto(value);
  }

  async offices(filters: { q?: string | undefined; active?: boolean | undefined }) {
    const values = await catalogRepository.listOffices(getPrisma(), { ...(filters.q ? { q: normalizeSearch(filters.q) } : {}), ...(filters.active !== undefined ? { active: filters.active } : {}) });
    return values.map(toOfficeDto);
  }

  async office(id: string) {
    const value = await catalogRepository.findOffice(getPrisma(), id);
    if (!value) throw new ApiError("NOT_FOUND", "Oficina no encontrada.");
    return toOfficeDto(value);
  }

  async createCourt(input: { name: string; jurisdiction?: string | null | undefined; address?: string | null | undefined; officeIds: string[] }, actor: AuthenticatedActor, context: RequestContext) {
    return getPrisma().$transaction(async (transaction) => {
      const value = await catalogRepository.createCourt(transaction, { name: input.name, nameNormalized: normalizeSearch(input.name), officeIds: input.officeIds, ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction } : {}), ...(input.address !== undefined ? { address: input.address } : {}) });
      await auditService.record(transaction, { actorId: actor.user.id, action: "COURT_CREATED", entityType: "Court", entityId: value.id, after: { name: value.name }, ...requestMetadata(context) });
      await outboxService.publish(transaction, { type: "COURT_CREATED", aggregateType: "Court", aggregateId: value.id, payload: { courtId: value.id } });
      return toCourtDto(value);
    });
  }

  async updateCourt(id: string, input: { name?: string | undefined; jurisdiction?: string | null | undefined; address?: string | null | undefined; officeIds?: string[] | undefined; isActive?: boolean | undefined }, actor: AuthenticatedActor, context: RequestContext) {
    return getPrisma().$transaction(async (transaction) => {
      const current = await catalogRepository.findCourt(transaction, id);
      if (!current) throw new ApiError("NOT_FOUND", "Juzgado no encontrado.");
      const value = await catalogRepository.updateCourt(transaction, id, { ...(input.name !== undefined ? { name: input.name, nameNormalized: normalizeSearch(input.name) } : {}), ...(input.jurisdiction !== undefined ? { jurisdiction: input.jurisdiction } : {}), ...(input.address !== undefined ? { address: input.address } : {}), ...(input.officeIds !== undefined ? { officeIds: input.officeIds } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) });
      await auditService.record(transaction, { actorId: actor.user.id, action: "COURT_UPDATED", entityType: "Court", entityId: id, before: { name: current.name, isActive: current.isActive }, after: { name: value.name, isActive: value.isActive }, ...requestMetadata(context) });
      await outboxService.publish(transaction, { type: "COURT_UPDATED", aggregateType: "Court", aggregateId: id, payload: { courtId: id } });
      return toCourtDto(value);
    });
  }

  async createOffice(input: { name: string; address?: string | null | undefined; courtIds: string[] }, actor: AuthenticatedActor, context: RequestContext) {
    return getPrisma().$transaction(async (transaction) => {
      const value = await catalogRepository.createOffice(transaction, { name: input.name, nameNormalized: normalizeSearch(input.name), courtIds: input.courtIds, ...(input.address !== undefined ? { address: input.address } : {}) });
      await auditService.record(transaction, { actorId: actor.user.id, action: "MANAGEMENT_OFFICE_CREATED", entityType: "ManagementOffice", entityId: value.id, after: { name: value.name }, ...requestMetadata(context) });
      await outboxService.publish(transaction, { type: "MANAGEMENT_OFFICE_CREATED", aggregateType: "ManagementOffice", aggregateId: value.id, payload: { managementOfficeId: value.id } });
      return toOfficeDto(value);
    });
  }

  async updateOffice(id: string, input: { name?: string | undefined; address?: string | null | undefined; courtIds?: string[] | undefined; isActive?: boolean | undefined }, actor: AuthenticatedActor, context: RequestContext) {
    return getPrisma().$transaction(async (transaction) => {
      const current = await catalogRepository.findOffice(transaction, id);
      if (!current) throw new ApiError("NOT_FOUND", "Oficina no encontrada.");
      const value = await catalogRepository.updateOffice(transaction, id, { ...(input.name !== undefined ? { name: input.name, nameNormalized: normalizeSearch(input.name) } : {}), ...(input.address !== undefined ? { address: input.address } : {}), ...(input.courtIds !== undefined ? { courtIds: input.courtIds } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) });
      await auditService.record(transaction, { actorId: actor.user.id, action: "MANAGEMENT_OFFICE_UPDATED", entityType: "ManagementOffice", entityId: id, before: { name: current.name, isActive: current.isActive }, after: { name: value.name, isActive: value.isActive }, ...requestMetadata(context) });
      await outboxService.publish(transaction, { type: "MANAGEMENT_OFFICE_UPDATED", aggregateType: "ManagementOffice", aggregateId: id, payload: { managementOfficeId: id } });
      return toOfficeDto(value);
    });
  }
}

export const catalogService = new CatalogService();
