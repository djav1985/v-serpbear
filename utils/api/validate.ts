/**
 * Server-side checks of a request against the shared contract (utils/api/contracts): the same schema the browser
 * client uses to build the request is used here to accept it. A request that does not match answers 400 with the
 * schema's messages as the error details, before any handler logic runs. Rules that need the database or other
 * context (does the domain exist, is it being refreshed) stay in the handlers.
 */
import { ZodError, type z } from 'zod';
import { endpoints, type Endpoints, type EndpointKey } from './contracts';
import { ApiError, getQuery, readJson } from '../apiLogging';

type QueryOut<K extends EndpointKey> = Endpoints[K] extends { query: infer Q extends z.ZodType } ? z.output<Q> : undefined;
type BodyOut<K extends EndpointKey> = Endpoints[K] extends { body: infer B extends z.ZodType } ? z.output<B> : undefined;

type SchemaNode = { def: { type: string, innerType?: SchemaNode, element?: SchemaNode, values?: unknown[] } };

/** Removes the optional and nullable wrappers to reach the type a query value must be. */
const unwrap = (node: SchemaNode): SchemaNode => (
   (node.def.type === 'optional' || node.def.type === 'nullable' || node.def.type === 'default') && node.def.innerType ? unwrap(node.def.innerType) : node
);

/** A query value is text. Booleans and numbers are read from it only when the text is exactly one; anything else stays text and fails the schema. */
const coerceScalar = (node: SchemaNode, text: string): unknown => {
   const { type, values } = unwrap(node).def;
   // A literal true, false or number is written as text in a query
   if (type === 'literal' && values) {
      const match = values.find((value) => typeof value !== 'string' && String(value) === text);
      return match !== undefined ? match : text;
   }
   if (type === 'boolean') { return text === 'true' ? true : text === 'false' ? false : text; }
   if (type === 'number') { return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text; }
   return text;
};

const coerceQueryValue = (node: SchemaNode, raw: string | string[]): unknown => {
   const target = unwrap(node);
   if (target.def.type === 'array' && target.def.element) {
      const element = target.def.element;
      return (Array.isArray(raw) ? raw : [raw]).flatMap((value) => value.split(',')).map((item) => coerceScalar(element, item.trim()));
   }
   return coerceScalar(target, Array.isArray(raw) ? raw[0] : raw);
};

const invalidRequest = (error: unknown): ApiError => {
   if (!(error instanceof ZodError)) { return new ApiError(400, 'BAD_REQUEST', 'Invalid request'); }
   const issues = error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
   const first = issues[0];
   const message = first ? `Invalid request: ${first.path ? `${first.path}: ` : ''}${first.message}` : 'Invalid request';
   return new ApiError(400, 'BAD_REQUEST', message, issues);
};

/** The query string, read as the endpoint's query schema describes it. Throws a 400 ApiError when it does not match. */
export const parseQuery = <K extends EndpointKey>(req: Request, key: K): QueryOut<K> => {
   const endpoint = endpoints[key] as { query?: z.ZodType };
   if (!endpoint.query) { return undefined as QueryOut<K>; }
   const shape = (endpoint.query as unknown as { shape: Record<string, SchemaNode> }).shape;
   const raw = getQuery(req);
   const input: Record<string, unknown> = {};
   Object.keys(shape).forEach((name) => {
      if (raw[name] !== undefined) { input[name] = coerceQueryValue(shape[name], raw[name]); }
   });
   try {
      return endpoint.query.parse(input) as QueryOut<K>;
   } catch (error) {
      throw invalidRequest(error);
   }
};

/**
 * The JSON body, checked against the endpoint's body schema. A missing body is a 400 unless `emptyBodyOk` is set,
 * for the endpoint whose body fields are all optional and may be left out (volume).
 */
export const parseBody = async <K extends EndpointKey>(req: Request, key: K, options: { emptyBodyOk?: boolean } = {}): Promise<BodyOut<K>> => {
   const endpoint = endpoints[key] as { body?: z.ZodType };
   if (!endpoint.body) { return undefined as BodyOut<K>; }
   const raw = await readJson(req);
   try {
      return endpoint.body.parse(raw === undefined && options.emptyBodyOk ? {} : raw) as BodyOut<K>;
   } catch (error) {
      throw invalidRequest(error);
   }
};
