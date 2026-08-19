import "server-only";

import { postgres } from "@/lib/postgres";
import type { ProjectListItem } from "@/lib/projects";

type ProjectListRow = {
  id: string;
  name: string;
  description: string;
  component_count: number | string;
  updated_at: Date | string;
  password_hash: string | null;
  total_count: number | string;
};

/**
 * Reads only the small dashboard projection from the JSON document. Pulling the
 * entire document made project lists transfer every sheet and row from
 * Supabase even though cards only render a description and component count.
 */
export async function listOwnedProjects(
  ownerId: string,
  limit?: number,
): Promise<{ projects: ProjectListItem[]; totalCount: number }> {
  const parameters: unknown[] = [ownerId];
  const limitSql = limit === undefined ? "" : `LIMIT $${parameters.push(limit)}`;
  const result = await postgres.query<ProjectListRow>(
    `SELECT
       p.id,
       p.name,
       COALESCE(p.document ->> 'description', '') AS description,
       COALESCE((
         SELECT SUM(
           CASE
             WHEN jsonb_typeof(page.value -> 'items') = 'array'
               THEN jsonb_array_length(page.value -> 'items')
             ELSE 0
           END
         )
         FROM jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(p.document -> 'pages') = 'array'
               THEN p.document -> 'pages'
             ELSE '[]'::jsonb
           END
         ) AS page(value)
       ), 0)::int AS component_count,
       p.updated_at,
       p.password_hash,
       COUNT(*) OVER()::int AS total_count
     FROM projects AS p
     WHERE p.owner_id = $1::uuid
       AND p.deleted_at IS NULL
     ORDER BY p.updated_at DESC
     ${limitSql}`,
    parameters,
  );
  return {
    projects: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      componentCount: Number(row.component_count),
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : new Date(row.updated_at).toISOString(),
      hasPassword: !!row.password_hash,
    })),
    totalCount: Number(result.rows[0]?.total_count ?? 0),
  };
}
