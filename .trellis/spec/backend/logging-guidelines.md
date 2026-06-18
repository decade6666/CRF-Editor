# Logging Guidelines

> How logging is done in this project.

---

## Overview

- **Library**: Python standard `logging` module
- **Format**: Simple text format with timestamp and level
- **Levels**: DEBUG, INFO, WARNING, ERROR, CRITICAL
- **Output**: Console (stdout) in development, can be configured for production

---

## Log Levels

| Level | When to Use | Example |
|-------|-------------|---------|
| DEBUG | Detailed diagnostic info | `logger.debug(f"Processing field {field_id}")` |
| INFO | Normal operation events | `logger.info(f"User {username} logged in")` |
| WARNING | Unexpected but handled | `logger.warning(f"Rate limit approached for {ip}")` |
| ERROR | Operation failed | `logger.error(f"Failed to import file: {error}")` |
| CRITICAL | System-level failure | `logger.critical("Database connection lost")` |

---

## Structured Logging

### Basic Setup

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)
```

### Module-Level Logger

```python
# In each module
import logging

logger = logging.getLogger(__name__)

def process_import(file_path: str):
    logger.info(f"Starting import from {file_path}")
    try:
        # ... processing
        logger.info(f"Import completed: {count} records")
    except Exception as e:
        logger.error(f"Import failed: {e}")
        raise
```

---

## What to Log

### Authentication Events

```python
# Successful login
logger.info(f"User '{username}' logged in from {client_ip}")

# Failed login attempt
logger.warning(f"Failed login attempt for '{username}' from {client_ip}")

# Password change
logger.info(f"User '{username}' changed password")
```

### Data Operations

```python
# Project creation
logger.info(f"Project '{project.name}' created by user {user_id}")

# Import operations
logger.info(f"Import started: {file_path}")
logger.info(f"Import completed: {records_imported} records")

# Export operations
logger.info(f"Export completed: {file_path}, {size} bytes")
```

### Rate Limiting

```python
# Rate limit triggered
logger.warning(f"Rate limit exceeded for {endpoint} from {client_ip}")

# Rate limit approaching
logger.debug(f"Request count for {endpoint}: {count}/{limit}")
```

### Migration Events

```python
# Migration applied
logger.info(f"Migration applied: added column {column_name}")

# Migration skipped (already exists)
logger.debug(f"Migration skipped: {column_name} already exists")
```

---

## What NOT to Log

### Never Log These

```python
# WRONG - passwords
logger.info(f"User password: {password}")  # NEVER!

# WRONG - tokens
logger.debug(f"JWT token: {token}")  # NEVER!

# WRONG - API keys
logger.info(f"API key: {api_key}")  # NEVER!
```

### Redact Sensitive Data

```python
# Correct - mask sensitive fields
def sanitize_for_log(data: dict) -> dict:
    sensitive = {"password", "token", "api_key", "secret"}
    return {
        k: "***REDACTED***" if k in sensitive else v
        for k, v in data.items()
    }

logger.info(f"Request data: {sanitize_for_log(request_data)}")
```

### PII Considerations

```python
# Be careful with user data
# OK - user ID
logger.info(f"User {user_id} performed action")

# CONSIDER - username may be PII in some contexts
logger.info(f"User '{username}' logged in")

# AVOID - full personal details
logger.info(f"User details: {user.email}, {user.phone}")  # Avoid if possible
```

---

## Common Patterns

### Request Context

```python
def log_request(request: Request, response: Response, process_time: float):
    logger.info(
        f"{request.method} {request.url.path} - "
        f"{response.status_code} - {process_time:.3f}s"
    )
```

### Error with Context

```python
try:
    result = risky_operation()
except SpecificError as e:
    logger.error(f"Operation failed for {resource_id}: {e}")
    raise HTTPException(status_code=400, detail=str(e))
except Exception as e:
    logger.exception(f"Unexpected error in operation: {e}")  # Includes stack trace
    raise HTTPException(status_code=500, detail="服务器内部错误")
```

### Conditional Debug Logging

```python
# Use guard to avoid expensive string formatting in production
if logger.isEnabledFor(logging.DEBUG):
    logger.debug(f"Detailed state: {expensive_to_compute()}")
```
