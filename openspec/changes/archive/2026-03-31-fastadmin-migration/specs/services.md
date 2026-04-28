# Spec: Service Layer

All service classes in `app/common/library/`.

## WeighService

**Purpose**: Unified ordering for all 8 weigh-sorted tables.

```php
class WeighService {
    const SAFE_OFFSET = 100000;

    /**
     * Insert a new record at position $position within scope.
     * Shifts existing records >= $position up by 1 using two-phase algorithm.
     */
    public static function insert(string $table, string $scopeField, int $scopeValue, int $position): int;

    /**
     * Move record $id to new position within its scope.
     */
    public static function move(string $table, int $id, string $scopeField, int $newPosition): void;

    /**
     * Remove record from ordering and compress scope.
     */
    public static function remove(string $table, int $id, string $scopeField): void;

    /**
     * Batch reorder: set weigh = index+1 for given ordered ID list.
     * Uses two-phase: first add SAFE_OFFSET, then subtract SAFE_OFFSET.
     */
    public static function batchReorder(string $table, string $scopeField, int $scopeValue, array $orderedIds): void;

    /**
     * Compress: renumber weigh values to 1..n with no gaps.
     */
    public static function compress(string $table, string $scopeField, int $scopeValue): void;
}
```

All operations wrapped in MySQL transactions with `SELECT ... FOR UPDATE`.

## ReferenceCheckService

**Purpose**: Check if a record can be safely deleted.

```php
class ReferenceCheckService {
    /**
     * Check all FK references to $id in $model.
     * Returns array of {table, count, label} for each referencing table.
     */
    public static function check(string $model, int $id): array;

    /**
     * Returns true if record has no references and can be deleted.
     */
    public static function canDelete(string $model, int $id): bool;
}
```

Coverage:
- `Codelist`: check `fa_field_definition` (codelist_id) + `fa_field` (codelist_id)
- `Unit`: check `fa_field_definition` (unit_id) + `fa_field` (unit_id)
- `Fielddefinition`: check `fa_form_field` (field_definition_id)
- `Form`: check `fa_visit_form` (form_id) — always strict block, no force delete
- `Visit`: check `fa_visit_form` (visit_id)

## ExportService

**Purpose**: Generate CRF Word documents via PHPWord.

```php
class ExportService {
    /**
     * Generate DOCX for project.
     * Saves to runtime/cache/export/{token}.docx
     * Returns ['token' => string, 'filename' => string]
     */
    public function generate(int $projectId): array;

    /**
     * Get file path for token. Returns null if expired/missing.
     */
    public function getFilePath(string $token): ?string;

    /**
     * Delete file for token (called after download).
     */
    public function cleanup(string $token): void;

    /**
     * Delete export files older than $ttl seconds.
     */
    public function cleanupExpired(int $ttl = 3600): void;
}
```

Token: `md5(uniqid() . $projectId)`. File: `runtime/cache/export/{token}.docx`.
Export order: cover -> table of contents -> visits (each visit: visit header, form tables) -> appendix.
Graceful degradation: missing logo/image -> placeholder text, continue export.

## ImportService

**Purpose**: Parse and import DOCX files into CRF forms/fields.

```php
class ImportService {
    /**
     * Parse uploaded DOCX. Returns preview structure without writing to DB.
     * Uses ZipArchive + DOMXPath on word/document.xml for OXML-level parsing.
     */
    public function parseDocx(string $filePath, int $projectId): array;

    /**
     * Commit import to DB. Creates/updates FieldDefinition, FormField, Codelist, Unit.
     * Handles: name conflicts (append _IMP), variable_name conflicts (append _IMP).
     * AI suggestions pre-applied if available.
     * Does NOT depend on AI success to complete import.
     */
    public function importDocx(string $filePath, int $projectId, array $options): array;
}
```

Parsing layers:
1. OXML parser: ZipArchive reads word/document.xml, DOMXPath extracts tables/cells
2. Structure classifier: identifies merged cells (colspan/rowspan), table roles, log rows
3. Domain writer: creates DB records via Model, uses WeighService for ordering

## ImportTemplateService

**Purpose**: Import form definitions from external SQLite template library.

```php
class ImportTemplateService {
    /**
     * Open .db file and return list of forms available.
     */
    public function parse(string $dbPath): array;

    /**
     * Import selected forms from .db into project.
     * Maps template FieldDefinitions to project's FieldDefinitions.
     * Creates new Codelist/Unit if not found in project (by code).
     */
    public function import(string $dbPath, int $projectId, array $formIds, array $options): array;
}
```

## AiReviewService

**Purpose**: Send form fields to external AI for review suggestions.

```php
class AiReviewService {
    /**
     * Review form fields. Returns suggestions array.
     * Graceful degradation: returns empty suggestions on error, never throws.
     */
    public function reviewForm(int $formId): array;

    /**
     * Test AI connection. Returns ['success' => bool, 'message' => string].
     */
    public function testConnection(): array;
}
```

Provider adapters:
- `OpenAiAdapter`: POST to `{base_url}/chat/completions`, `response_format: {type: json_object}`
- `AnthropicAdapter`: POST to `{base_url}/messages`, system prompt + user message
- Auto-detection: config `ai.provider` = 'openai' | 'anthropic'
- All HTTP via Guzzle with timeout=30s, retry=1
- Suggested field_type validated against whitelist before returning
- API key masked in all log output

## ScreenshotWorker

**Purpose**: Async CLI worker for DOCX page screenshot generation.

```php
// CLI command: php think screenshot:generate {project_id}
class ScreenshotWorker {
    /**
     * Start async job. Writes initial status file.
     * Returns job_id.
     */
    public function start(int $projectId): string;

    /**
     * Get job status. Reads from runtime/cache/screenshot/{job_id}.json.
     */
    public function getStatus(string $jobId): array;

    /**
     * Main worker logic. Called by CLI command.
     * Uses LibreOffice headless for PDF conversion.
     * Updates status file during processing.
     */
    public function run(int $projectId): void;
}
```

Status file: `runtime/cache/screenshot/{job_id}.json`
```json
{
  "status": "pending|processing|completed|failed",
  "progress": 0,
  "total_pages": 0,
  "pages": [],
  "error": null
}
```
