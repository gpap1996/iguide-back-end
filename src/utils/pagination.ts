import { Context } from "hono";
import { SelectQueryBuilder, sql } from "kysely";

// Types for pagination
interface PaginationParams {
  limit: number;
  page: number;
}

interface PaginationResult {
  success: true;
  items: any[];
  pagination: {
    limit: number;
    page: number;
    totalItems: number;
    currentPage: number;
    totalPages: number;
  };
}

interface PaginationError {
  success: false;
  error: string;
  message: string;
  statusCode: number;
}

type PaginationResponse = PaginationResult | PaginationError;

// Utility to extract pagination parameters from request
export const getPaginationParams = (c: Context): PaginationParams => {
  const limit = parseInt(c.req.query("limit") || "10", 10);
  const page = parseInt(c.req.query("page") || "1", 10);
  return { limit, page };
};

// Main pagination utility that handles both the count query and data query
export async function paginateQuery<T extends Record<string, any>>(
  baseQuery: SelectQueryBuilder<any, any, T>,
  params: PaginationParams
): Promise<PaginationResponse> {
  const { limit, page } = params;

  // Handle case where limit is -1 (return all results)
  if (limit === -1) {
    const items = await baseQuery.orderBy("created_at", "desc").execute();
    return {
      success: true,
      items,
      pagination: {
        limit,
        page,
        totalItems: items.length,
        currentPage: page,
        totalPages: 1,
      },
    };
  }

  // Calculate offset
  const offset = (page - 1) * limit;

  // Create separate queries for count and data
  const countQuery = baseQuery.clearSelect().select(sql`COUNT(*)`.as("count"));

  // Execute count query
  const [totalResult] = await countQuery.execute();
  const totalItems = Number(totalResult?.count || 0);
  const totalPages = Math.ceil(totalItems / limit);

  // Validate page number
  if (page > totalPages && totalPages > 0) {
    return {
      success: false,
      error: "Invalid page number",
      message: `The requested page number ${page} exceeds the total number of pages (${totalPages}). Please request a page number between 1 and ${totalPages}.`,
      statusCode: 400,
    };
  }

  // Execute main query with pagination
  const items = await baseQuery
    .limit(limit)
    .offset(offset)
    .orderBy("created_at", "desc")
    .execute();

  return {
    success: true,
    items,
    pagination: {
      limit,
      page,
      totalItems,
      currentPage: page,
      totalPages,
    },
  };
}
