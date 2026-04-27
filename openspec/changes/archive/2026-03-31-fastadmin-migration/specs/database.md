# Spec: Database Schema

## Tables and Schemas

### fa_project
```sql
CREATE TABLE `fa_project` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL DEFAULT '',
  `code` varchar(100) NOT NULL DEFAULT '',
  `description` text,
  `logo` varchar(255) NOT NULL DEFAULT '',
  `status` varchar(30) NOT NULL DEFAULT 'normal' COMMENT '状态:normal=正常,hidden=隐藏',
  `weigh` int(10) NOT NULL DEFAULT 0,
  `createtime` int(10) unsigned NOT NULL DEFAULT 0,
  `updatetime` int(10) unsigned NOT NULL DEFAULT 0,
  `deletetime` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_project_name` (`name`),
  KEY `idx_project_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
- Unique constraint: application-layer `WHERE deletetime IS NULL AND name = ?`
- No DB UNIQUE index (soft-delete allows re-creation)

### fa_visit
```sql
CREATE TABLE `fa_visit` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int(10) unsigned NOT NULL,
  `name` varchar(255) NOT NULL DEFAULT '',
  `code` varchar(100) NOT NULL DEFAULT '',
  `description` text,
  `weigh` int(10) NOT NULL DEFAULT 0,
  `createtime` int(10) unsigned NOT NULL DEFAULT 0,
  `updatetime` int(10) unsigned NOT NULL DEFAULT 0,
  `deletetime` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_visit_project` (`project_id`),
  KEY `idx_visit_name` (`project_id`, `name`),
  KEY `idx_visit_code` (`project_id`, `code`),
  KEY `idx_visit_weigh` (`project_id`, `weigh`),
  CONSTRAINT `fk_visit_project` FOREIGN KEY (`project_id`) REFERENCES `fa_project` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### fa_form
```sql
CREATE TABLE `fa_form` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int(10) unsigned NOT NULL,
  `name` varchar(255) NOT NULL DEFAULT '',
  `code` varchar(100) NOT NULL DEFAULT '',
  `description` text,
  `design_notes` text,
  `weigh` int(10) NOT NULL DEFAULT 0,
  `createtime` int(10) unsigned NOT NULL DEFAULT 0,
  `updatetime` int(10) unsigned NOT NULL DEFAULT 0,
  `deletetime` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_form_project` (`project_id`),
  KEY `idx_form_name` (`project_id`, `name`),
  KEY `idx_form_code` (`project_id`, `code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
- Deletion blocked (409) if any fa_visit_form references this form

### fa_visit_form
```sql
CREATE TABLE `fa_visit_form` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `visit_id` int(10) unsigned NOT NULL,
  `form_id` int(10) unsigned NOT NULL,
  `weigh` int(10) NOT NULL DEFAULT 0,
  `createtime` int(10) unsigned NOT NULL DEFAULT 0,
  `updatetime` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_visit_form` (`visit_id`, `form_id`),
  UNIQUE KEY `uniq_visit_weigh` (`visit_id`, `weigh`),
  KEY `idx_visitform_form` (`form_id`),
  CONSTRAINT `fk_visitform_visit` FOREIGN KEY (`visit_id`) REFERENCES `fa_visit` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_visitform_form` FOREIGN KEY (`form_id`) REFERENCES `fa_form` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### fa_field_definition
```sql
CREATE TABLE `fa_field_definition` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int(10) unsigned NOT NULL,
  `variable_name` varchar(100) NOT NULL DEFAULT '',
  `label` varchar(255) NOT NULL DEFAULT '',
  `field_type` varchar(50) NOT NULL DEFAULT '' COMMENT '类型:text=文本,number=数字,date=日期,select=单选,checkbox=多选,textarea=多行文本',
  `unit_id` int(10) unsigned DEFAULT NULL,
  `codelist_id` int(10) unsigned DEFAULT NULL,
  `required` tinyint(1) NOT NULL DEFAULT 0,
  `default_value` text,
  `trailing_line` tinyint(1) NOT NULL DEFAULT 0,
  `weigh` int(10) NOT NULL DEFAULT 0,
  `createtime` int(10) unsigned NOT NULL DEFAULT 0,
  `updatetime` int(10) unsigned NOT NULL DEFAULT 0,
  `deletetime` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fielddef_project` (`project_id`),
  KEY `idx_fielddef_varname` (`project_id`, `variable_name`),
  KEY `idx_fielddef_codelist` (`codelist_id`),
  KEY `idx_fielddef_unit` (`unit_id`),
  CONSTRAINT `fk_fielddef_project` FOREIGN KEY (`project_id`) REFERENCES `fa_project` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fielddef_codelist` FOREIGN KEY (`codelist_id`) REFERENCES `fa_codelist` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fielddef_unit` FOREIGN KEY (`unit_id`) REFERENCES `fa_unit` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
- Unique constraint: application-layer `WHERE deletetime IS NULL AND variable_name = ? AND project_id = ?`

### fa_form_field
```sql
CREATE TABLE `fa_form_field` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `form_id` int(10) unsigned NOT NULL,
  `field_definition_id` int(10) unsigned DEFAULT NULL COMMENT 'NULL for log rows',
  `label` varchar(255) NOT NULL DEFAULT '',
  `is_log_row` tinyint(1) NOT NULL DEFAULT 0,
  `weigh` int(10) NOT NULL DEFAULT 0,
  `createtime` int(10) unsigned NOT NULL DEFAULT 0,
  `updatetime` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_form_field_def` (`form_id`, `field_definition_id`),
  UNIQUE KEY `uniq_form_field_weigh` (`form_id`, `weigh`),
  KEY `idx_formfield_fielddef` (`field_definition_id`),
  CONSTRAINT `fk_formfield_form` FOREIGN KEY (`form_id`) REFERENCES `fa_form` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_formfield_fielddef` FOREIGN KEY (`field_definition_id`) REFERENCES `fa_field_definition` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
- MySQL NULL uniqueness: multiple log rows (field_definition_id IS NULL) allowed
- field_definition_id ON DELETE RESTRICT: must unlink FormFields before deleting FieldDefinition

### fa_codelist
```sql
CREATE TABLE `fa_codelist` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int(10) unsigned NOT NULL,
  `name` varchar(255) NOT NULL DEFAULT '',
  `code` varchar(100) NOT NULL DEFAULT '',
  `description` text,
  `weigh` int(10) NOT NULL DEFAULT 0,
  `createtime` int(10) unsigned NOT NULL DEFAULT 0,
  `updatetime` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_codelist_code` (`project_id`, `code`),
  KEY `idx_codelist_project` (`project_id`),
  CONSTRAINT `fk_codelist_project` FOREIGN KEY (`project_id`) REFERENCES `fa_project` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### fa_codelist_option
```sql
CREATE TABLE `fa_codelist_option` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `codelist_id` int(10) unsigned NOT NULL,
  `code` varchar(50) NOT NULL DEFAULT '',
  `decode` varchar(255) NOT NULL DEFAULT '',
  `trailing_underscore` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Append underscore to rendered output text only',
  `weigh` int(10) NOT NULL DEFAULT 0,
  `createtime` int(10) unsigned NOT NULL DEFAULT 0,
  `updatetime` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_option_code_decode` (`codelist_id`, `code`, `decode`),
  UNIQUE KEY `uniq_option_weigh` (`codelist_id`, `weigh`),
  KEY `idx_option_codelist` (`codelist_id`),
  CONSTRAINT `fk_option_codelist` FOREIGN KEY (`codelist_id`) REFERENCES `fa_codelist` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### fa_unit
```sql
CREATE TABLE `fa_unit` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `project_id` int(10) unsigned NOT NULL,
  `name` varchar(100) NOT NULL DEFAULT '',
  `code` varchar(50) NOT NULL DEFAULT '',
  `weigh` int(10) NOT NULL DEFAULT 0,
  `createtime` int(10) unsigned NOT NULL DEFAULT 0,
  `updatetime` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_unit_code` (`project_id`, `code`),
  KEY `idx_unit_project` (`project_id`),
  CONSTRAINT `fk_unit_project` FOREIGN KEY (`project_id`) REFERENCES `fa_project` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### fa_field (read-only compatibility layer)
```sql
CREATE TABLE `fa_field` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `form_id` int(10) unsigned NOT NULL,
  `field_type` varchar(50) NOT NULL DEFAULT '',
  `variable_name` varchar(100) NOT NULL DEFAULT '',
  `label` varchar(255) NOT NULL DEFAULT '',
  `unit_id` int(10) unsigned DEFAULT NULL,
  `codelist_id` int(10) unsigned DEFAULT NULL,
  `required` tinyint(1) NOT NULL DEFAULT 0,
  `default_value` text,
  `weigh` int(10) NOT NULL DEFAULT 0,
  `createtime` int(10) unsigned NOT NULL DEFAULT 0,
  `updatetime` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_field_form` (`form_id`),
  KEY `idx_field_codelist` (`codelist_id`),
  KEY `idx_field_unit` (`unit_id`),
  CONSTRAINT `fk_field_form` FOREIGN KEY (`form_id`) REFERENCES `fa_form` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_field_codelist` FOREIGN KEY (`codelist_id`) REFERENCES `fa_codelist` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_field_unit` FOREIGN KEY (`unit_id`) REFERENCES `fa_unit` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
- Controller: list-only, add/edit/del methods disabled
