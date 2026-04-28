# Spec: Models

All models in `app/common/model/`. Extends `\think\Model` (ThinkPHP ActiveRecord).

## Model Conventions

- `protected $autoWriteTimestamp = 'int';` on all models
- `protected $pk = 'id';` (default, explicit for clarity)
- Soft delete models: `use \think\model\concern\SoftDelete;` + `protected $deleteTime = 'deletetime';`
- Weigh-sorted models define scope for ordering

## Model Inventory

| Model | File | Soft Delete | Relations |
|-------|------|------------|-----------|
| Project | Project.php | YES | hasMany(Visit), hasMany(Form), hasMany(Fielddefinition), hasMany(Codelist), hasMany(Unit) |
| Visit | Visit.php | YES | belongsTo(Project), belongsToMany(Form, 'fa_visit_form') |
| Form | Form.php | YES | belongsTo(Project), hasMany(Formfield), belongsToMany(Visit, 'fa_visit_form') |
| Field | Field.php | NO | belongsTo(Form), belongsTo(Codelist), belongsTo(Unit) |
| Fielddefinition | Fielddefinition.php | YES | belongsTo(Project), belongsTo(Codelist), belongsTo(Unit), hasMany(Formfield) |
| Formfield | Formfield.php | NO | belongsTo(Form), belongsTo(Fielddefinition) |
| Visitform | Visitform.php | NO | belongsTo(Visit), belongsTo(Form) |
| Codelist | Codelist.php | NO | belongsTo(Project), hasMany(CodelistOption) |
| CodelistOption | CodelistOption.php | NO | belongsTo(Codelist) |
| Unit | Unit.php | NO | belongsTo(Project) |

## Key Model Implementations

### Project.php
```php
class Project extends Model {
    use SoftDelete;
    protected $autoWriteTimestamp = 'int';
    protected $deleteTime = 'deletetime';

    public function visits() { return $this->hasMany('Visit', 'project_id'); }
    public function forms() { return $this->hasMany('Form', 'project_id'); }
    public function fielddefinitions() { return $this->hasMany('Fielddefinition', 'project_id'); }
    public function codelists() { return $this->hasMany('Codelist', 'project_id'); }
    public function units() { return $this->hasMany('Unit', 'project_id'); }

    // Scope: active records only
    public function scopeActive($query) {
        return $query->where('deletetime', NULL);
    }
}
```

### Form.php
```php
class Form extends Model {
    use SoftDelete;
    protected $autoWriteTimestamp = 'int';

    public function formfields() {
        return $this->hasMany('Formfield', 'form_id')->order('weigh ASC');
    }
    public function visits() {
        return $this->belongsToMany('Visit', 'fa_visit_form', 'form_id', 'visit_id');
    }

    // Check if form has any visit associations (for delete block)
    public function hasVisitAssociations(): bool {
        return Visitform::where('form_id', $this->id)->count() > 0;
    }
}
```

### Formfield.php
```php
class Formfield extends Model {
    protected $autoWriteTimestamp = 'int';

    public function fielddefinition() {
        return $this->belongsTo('Fielddefinition', 'field_definition_id');
    }

    // Scope: log rows
    public function scopeLogRows($query) {
        return $query->where('is_log_row', 1)->where('field_definition_id', NULL);
    }

    // Scope: non-log rows ordered by weigh
    public function scopeFields($query) {
        return $query->where('is_log_row', 0)->order('weigh ASC');
    }
}
```

### Fielddefinition.php
```php
class Fielddefinition extends Model {
    use SoftDelete;
    protected $autoWriteTimestamp = 'int';

    public function codelist() { return $this->belongsTo('Codelist'); }
    public function unit() { return $this->belongsTo('Unit'); }
    public function formfields() { return $this->hasMany('Formfield', 'field_definition_id'); }

    public function hasFormFieldReferences(): bool {
        return $this->formfields()->count() > 0;
    }
}
```

### CodelistOption.php
```php
class CodelistOption extends Model {
    protected $autoWriteTimestamp = 'int';

    public function codelist() { return $this->belongsTo('Codelist'); }

    // Rendered text: apply trailing_underscore to display output only
    public function getRenderedDecode(): string {
        return $this->trailing_underscore ? $this->decode . '_' : $this->decode;
    }
}
```
