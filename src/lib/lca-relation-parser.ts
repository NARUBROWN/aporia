export type BulkRelationDefinition = {
  name: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  relationType: "1:1" | "N:1";
  checked: boolean;
  onDelete: "CASCADE" | "SET NULL" | "NO ACTION";
};

function singleColumnUniqueKeys(sql: string) {
  const keys = new Set<string>();
  const patterns = [
    /ALTER\s+TABLE\s+\[dbo\]\.\[([^\]]+)\][^;]*?UNIQUE\s+NONCLUSTERED\s*\(\[([^\]]+)\]\)\s*;/gi,
    /CREATE\s+UNIQUE\s+NONCLUSTERED\s+INDEX\s+\[[^\]]+\]\s+ON\s+\[dbo\]\.\[([^\]]+)\]\s*\(\[([^\]]+)\]\)(?:\s+WHERE[\s\S]*?)?;/gi,
  ];
  for (const pattern of patterns)
    for (const match of sql.matchAll(pattern)) keys.add(`${match[1]}.${match[2]}`);
  return keys;
}

export function parseBulkRelations(sql: string): BulkRelationDefinition[] {
  const uniqueKeys = singleColumnUniqueKeys(sql);
  const pattern = /ALTER\s+TABLE\s+\[dbo\]\.\[([^\]]+)\]\s+WITH\s+(NO)?CHECK\s+ADD\s+CONSTRAINT\s+\[([^\]]+)\]\s+FOREIGN\s+KEY\s*\(\[([^\]]+)\]\)\s+REFERENCES\s+\[dbo\]\.\[([^\]]+)\]\s*\(\[([^\]]+)\]\)(?:\s+ON\s+DELETE\s+(CASCADE|SET\s+NULL|NO\s+ACTION))?\s*;/gi;
  return [...sql.matchAll(pattern)].map((match) => ({
    sourceTable: match[1],
    checked: !match[2],
    name: match[3],
    sourceColumn: match[4],
    targetTable: match[5],
    targetColumn: match[6],
    relationType: uniqueKeys.has(`${match[1]}.${match[4]}`) ? "1:1" : "N:1",
    onDelete: (match[7]?.replace(/\s+/g, " ").toUpperCase() ?? "NO ACTION") as BulkRelationDefinition["onDelete"],
  }));
}
