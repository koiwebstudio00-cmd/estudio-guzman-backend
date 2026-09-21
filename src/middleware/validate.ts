import type { Request, RequestHandler, Response } from "express";
import type { z } from "zod";

type MaybeSchema = z.ZodType | undefined;

interface RequestSchemas<
  Body extends MaybeSchema,
  Params extends MaybeSchema,
  Query extends MaybeSchema
> {
  body?: Body;
  params?: Params;
  query?: Query;
}

interface ValidatedInput<
  Body extends MaybeSchema,
  Params extends MaybeSchema,
  Query extends MaybeSchema
> {
  body: Body extends z.ZodType ? z.output<Body> : undefined;
  params: Params extends z.ZodType ? z.output<Params> : undefined;
  query: Query extends z.ZodType ? z.output<Query> : undefined;
}

type ValidatedHandler<
  Body extends MaybeSchema,
  Params extends MaybeSchema,
  Query extends MaybeSchema
> = (
  req: Request,
  res: Response,
  input: ValidatedInput<Body, Params, Query>
) => unknown | Promise<unknown>;

export function validateRequest<
  Body extends MaybeSchema = undefined,
  Params extends MaybeSchema = undefined,
  Query extends MaybeSchema = undefined
>(
  schemas: RequestSchemas<Body, Params, Query>,
  handler: ValidatedHandler<Body, Params, Query>
): RequestHandler {
  return async (req, res) => {
    const input = {
      body: schemas.body?.parse(req.body),
      params: schemas.params?.parse(req.params),
      query: schemas.query?.parse(req.query)
    } as ValidatedInput<Body, Params, Query>;

    await handler(req, res, input);
  };
}
