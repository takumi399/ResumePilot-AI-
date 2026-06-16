# ResumePilot AI — REST API Specification v1.0

---

## 1. API Design Principles

### 1.1 RESTful Conventions

| Principle | Rule |
|-----------|------|
| **Resource naming** | Plural nouns, kebab-case for multi-word resources (`/resume-versions`, `/job-descriptions`) |
| **HTTP methods** | `GET` (read), `POST` (create), `PUT` (full replace), `PATCH` (partial update), `DELETE` (remove) |
| **Idempotency** | `GET`, `PUT`, `DELETE` are idempotent. `POST` is not. Idempotency keys required for mutating `POST` when retry safety matters. |
| **Statelessness** | Every request carries its own authentication context. No server-side sessions. |
| **HATEOAS** | Responses include `_links` objects with related resource URLs. Not mandatory for internal consumers but present in public-facing responses. |
| **Content negotiation** | `Accept` / `Content-Type` headers. JSON is the only supported format (`application/json`). |
| **Compression** | `gzip`, `br` (Brotli) supported. Client signals via `Accept-Encoding`. |

### 1.2 Versioning Strategy

**URL-path versioning** (chosen over header-based for discoverability and simplicity):

```
https://api.resumepilot.ai/v1/resumes
https://api.resumepilot.ai/v2/resumes   (future)
```

**Rationale:** URL versioning makes the API version immediately visible in logs, curl commands, and browser dev tools. It prevents accidental version mismatches in load-balanced environments where header stripping can occur. Backward-compatible additions (new optional fields) do NOT require a version bump. Breaking changes (field removal, type changes, mandatory new fields) always ship under a new major version.

**Deprecation policy:** Old versions are supported for 12 months after a new major version release. The `Sunset` HTTP header is returned on deprecated versions:

```
Sunset: Sat, 01 Jan 2027 00:00:00 GMT
```

### 1.3 Base URL

| Environment | Base URL |
|-------------|----------|
| Production | `https://api.resumepilot.ai` |
| Staging | `https://api.staging.resumepilot.ai` |
| Local | `http://localhost:8080` |

---

## 2. Authentication & Authorization

### 2.1 Token-Based Auth (JWT)

ResumePilot uses short-lived JWT access tokens + long-lived refresh tokens.

- **Access token:** 15-minute expiry, signed with RS256, carried in `Authorization: Bearer <token>`
- **Refresh token:** 30-day expiry, opaque string stored hashed in DB, used only at the auth endpoint
- **Token rotation:** Each refresh invalidates the previous refresh token (detects stolen refresh tokens)

### 2.2 API Key Auth (for programmatic/resume-parsing pipelines)

- `X-API-Key: rp_<random_32_chars>` header
- Scoped to a single user or team
- Configurable IP allowlist per key
- Rate limits are per-key

### 2.3 Endpoints

#### 2.3.1 Register

```
POST /v1/auth/register
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "Str0ng!Passw0rd",
  "first_name": "Jane",
  "last_name": "Doe",
  "accept_terms": true
}
```

**Response** `201 Created`:
```json
{
  "user": {
    "id": "usr_3fa2b1c84e",
    "email": "user@example.com",
    "first_name": "Jane",
    "last_name": "Doe",
    "created_at": "2026-06-16T10:30:00Z"
  },
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "rt_9a8b7c6d5e4f3a2b1c0d",
  "expires_in": 900,
  "token_type": "Bearer",
  "_links": {
    "self": "/v1/auth/register",
    "profile": "/v1/users/usr_3fa2b1c84e"
  }
}
```

**Validation rules:**
- `email`: valid format, unique, max 254 chars
- `password`: min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit, 1 special
- `first_name` / `last_name`: 1-64 chars, letters/hyphens/apostrophes only

#### 2.3.2 Login

```
POST /v1/auth/login
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "Str0ng!Passw0rd"
}
```

**Response** `200 OK`: Same shape as register response.

**Rate limit:** 5 attempts per email per 15 minutes. After 5 failures, account is temporarily locked for 15 minutes.

#### 2.3.3 Refresh Token

```
POST /v1/auth/refresh
```

**Request:**
```json
{
  "refresh_token": "rt_9a8b7c6d5e4f3a2b1c0d"
}
```

**Response** `200 OK`: New access + refresh token pair. Previous refresh token is invalidated.

#### 2.3.4 Logout

```
POST /v1/auth/logout
```

**Request:**
```json
{
  "refresh_token": "rt_9a8b7c6d5e4f3a2b1c0d"
}
```

**Response** `204 No Content`: Refresh token is revoked server-side.

#### 2.3.5 Forgot Password

```
POST /v1/auth/forgot-password
```

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response** `200 OK` (always returns 200 to prevent email enumeration):
```json
{
  "message": "If an account exists for this email, a reset link has been sent."
}
```

#### 2.3.6 Reset Password

```
POST /v1/auth/reset-password
```

**Request:**
```json
{
  "token": "reset_token_from_email",
  "new_password": "N3w!Str0ngP4ss"
}
```

**Response** `200 OK`:
```json
{
  "message": "Password has been reset successfully."
}
```

#### 2.3.7 Email Verification

```
POST /v1/auth/verify-email
```

**Request:**
```json
{
  "token": "verification_token_from_email"
}
```

**Response** `200 OK`:
```json
{
  "message": "Email verified successfully."
}
```

#### 2.3.8 Resend Verification

```
POST /v1/auth/resend-verification
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "message": "Verification email resent."
}
```

---

## 3. User / Profile Endpoints

### 3.1 Get Current User

```
GET /v1/users/me
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "id": "usr_3fa2b1c84e",
  "email": "user@example.com",
  "first_name": "Jane",
  "last_name": "Doe",
  "avatar_url": "https://cdn.resumepilot.ai/avatars/usr_3fa2b1c84e.jpg",
  "email_verified": true,
  "plan": "pro",
  "plan_expires_at": "2026-07-16T10:30:00Z",
  "credits_remaining": 42,
  "preferences": {
    "language": "en",
    "timezone": "America/New_York",
    "default_export_format": "pdf",
    "notifications": {
      "email_analysis_complete": true,
      "email_marketing": false
    }
  },
  "created_at": "2026-06-16T10:30:00Z",
  "updated_at": "2026-06-16T10:30:00Z",
  "_links": {
    "self": "/v1/users/usr_3fa2b1c84e",
    "resumes": "/v1/resumes",
    "api_keys": "/v1/users/me/api-keys"
  }
}
```

### 3.2 Update Current User

```
PATCH /v1/users/me
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "first_name": "Janet",
  "preferences": {
    "language": "zh-CN",
    "default_export_format": "docx"
  }
}
```

**Response** `200 OK`: Updated user object.

### 3.3 Update Password

```
PUT /v1/users/me/password
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "current_password": "Old!Passw0rd",
  "new_password": "N3w!Passw0rd"
}
```

**Response** `200 OK`:
```json
{
  "message": "Password updated successfully."
}
```

### 3.4 Upload Avatar

```
POST /v1/users/me/avatar
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

**Request:** `file` field (JPEG/PNG, max 2MB, min 128x128, max 4096x4096)

**Response** `200 OK`:
```json
{
  "avatar_url": "https://cdn.resumepilot.ai/avatars/usr_3fa2b1c84e.jpg"
}
```

### 3.5 Delete Account

```
DELETE /v1/users/me
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "password": "Current!Passw0rd",
  "confirmation": "DELETE"
}
```

**Response** `204 No Content`. All user data is soft-deleted (GDPR-compliant 30-day grace period before permanent deletion).

### 3.6 API Key Management

#### 3.6.1 List API Keys

```
GET /v1/users/me/api-keys
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "data": [
    {
      "id": "key_a1b2c3d4",
      "name": "My CI Pipeline",
      "prefix": "rp_a1b2",
      "scopes": ["resume:read", "resume:write", "analysis:read"],
      "last_used_at": "2026-06-15T08:00:00Z",
      "created_at": "2026-06-01T12:00:00Z",
      "expires_at": "2027-06-01T12:00:00Z"
    }
  ],
  "total": 1,
  "_links": {
    "self": "/v1/users/me/api-keys"
  }
}
```

#### 3.6.2 Create API Key

```
POST /v1/users/me/api-keys
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "name": "My CI Pipeline",
  "scopes": ["resume:read", "resume:write", "analysis:read"],
  "expires_in_days": 365
}
```

**Response** `201 Created`:
```json
{
  "id": "key_a1b2c3d4",
  "name": "My CI Pipeline",
  "key": "rp_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "scopes": ["resume:read", "resume:write", "analysis:read"],
  "created_at": "2026-06-16T12:00:00Z",
  "expires_at": "2027-06-16T12:00:00Z"
}
```

The full key is returned ONLY once at creation time.

#### 3.6.3 Revoke API Key

```
DELETE /v1/users/me/api-keys/{key_id}
Authorization: Bearer <access_token>
```

**Response** `204 No Content`.

---

## 4. Resume CRUD Endpoints

### 4.1 List Resumes

```
GET /v1/resumes
Authorization: Bearer <access_token>
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `per_page` | integer | 20 | Items per page (max 100) |
| `sort` | string | `-updated_at` | Sort field. Prefix `-` for descending. Fields: `created_at`, `updated_at`, `title`, `ats_score` |
| `search` | string | — | Full-text search across title, summary, skills |
| `status` | string | — | Filter: `draft`, `complete`, `archived` |
| `template_id` | string | — | Filter by template used |
| `ats_score_min` | integer | — | Minimum ATS score |
| `ats_score_max` | integer | — | Maximum ATS score |
| `created_after` | ISO 8601 | — | Filter by creation date |
| `created_before` | ISO 8601 | — | Filter by creation date |
| `tag` | string | — | Filter by tag (repeatable: `?tag=tech&tag=management`) |

**Response** `200 OK`:
```json
{
  "data": [
    {
      "id": "res_8a7b6c5d",
      "title": "Senior Frontend Engineer",
      "status": "complete",
      "ats_score": 87,
      "template_id": "tpl_professional",
      "thumbnail_url": "https://cdn.resumepilot.ai/thumbnails/res_8a7b6c5d.png",
      "tags": ["tech", "frontend"],
      "version_count": 3,
      "created_at": "2026-06-10T10:00:00Z",
      "updated_at": "2026-06-16T09:30:00Z",
      "_links": {
        "self": "/v1/resumes/res_8a7b6c5d",
        "versions": "/v1/resumes/res_8a7b6c5d/versions",
        "export": "/v1/resumes/res_8a7b6c5d/export"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 5,
    "total_pages": 1,
    "has_next": false,
    "has_previous": false
  },
  "_links": {
    "self": "/v1/resumes?page=1&per_page=20",
    "first": "/v1/resumes?page=1&per_page=20",
    "last": "/v1/resumes?page=1&per_page=20"
  }
}
```

### 4.2 Get Resume

```
GET /v1/resumes/{resume_id}
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "id": "res_8a7b6c5d",
  "title": "Senior Frontend Engineer",
  "status": "complete",
  "template_id": "tpl_professional",
  "target_role": "Senior Frontend Engineer",
  "summary": "Experienced frontend engineer with 8+ years...",
  "sections": {
    "contact": {
      "full_name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+1-555-0123",
      "location": "New York, NY",
      "linkedin": "https://linkedin.com/in/janedoe",
      "website": "https://janedoe.dev",
      "github": "https://github.com/janedoe"
    },
    "summary": {
      "text": "Experienced frontend engineer with 8+ years building performant web applications..."
    },
    "experience": [
      {
        "id": "exp_1a2b3c4d",
        "company": "TechCorp Inc.",
        "title": "Senior Frontend Engineer",
        "location": "New York, NY",
        "start_date": "2022-03",
        "end_date": null,
        "is_current": true,
        "bullets": [
          "Led migration from AngularJS to React, reducing bundle size by 40% and improving LCP by 200ms",
          "Architected component library used by 5 product teams, serving 2M+ monthly users",
          "Mentored 4 junior engineers through structured code review and pair programming program"
        ]
      }
    ],
    "education": [
      {
        "id": "edu_5e6f7g8h",
        "institution": "MIT",
        "degree": "B.S. Computer Science",
        "start_date": "2014-09",
        "end_date": "2018-05",
        "gpa": "3.8"
      }
    ],
    "skills": {
      "languages": ["TypeScript", "JavaScript", "Python", "SQL"],
      "frameworks": ["React", "Next.js", "Node.js", "Express"],
      "tools": ["Docker", "AWS", "GitHub Actions", "Webpack", "Vite"],
      "soft_skills": ["Technical Leadership", "Cross-team Collaboration", "Mentoring"]
    },
    "projects": [],
    "certifications": [
      {
        "id": "cert_9i0j1k2l",
        "name": "AWS Solutions Architect Associate",
        "issuer": "Amazon Web Services",
        "date": "2025-03",
        "url": "https://aws.amazon.com/verification/abc123"
      }
    ],
    "languages_spoken": [
      { "language": "English", "proficiency": "Native" },
      { "language": "Mandarin Chinese", "proficiency": "Professional" }
    ]
  },
  "metadata": {
    "ats_score": 87,
    "readability_score": 72,
    "word_count": 548,
    "keyword_density": { "react": 4, "typescript": 3 },
    "last_analyzed_at": "2026-06-16T09:30:00Z"
  },
  "tags": ["tech", "frontend"],
  "created_at": "2026-06-10T10:00:00Z",
  "updated_at": "2026-06-16T09:30:00Z",
  "_links": {
    "self": "/v1/resumes/res_8a7b6c5d",
    "versions": "/v1/resumes/res_8a7b6c5d/versions",
    "analyze": "/v1/resumes/res_8a7b6c5d/analyze",
    "optimize": "/v1/resumes/res_8a7b6c5d/optimize",
    "export": "/v1/resumes/res_8a7b6c5d/export",
    "history": "/v1/resumes/res_8a7b6c5d/history"
  }
}
```

### 4.3 Create Resume

```
POST /v1/resumes
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "title": "Senior Frontend Engineer",
  "target_role": "Senior Frontend Engineer",
  "template_id": "tpl_professional",
  "sections": { ... },
  "tags": ["tech", "frontend"]
}
```

**Response** `201 Created`:
```json
{
  "id": "res_8a7b6c5d",
  "title": "Senior Frontend Engineer",
  "status": "draft",
  "template_id": "tpl_professional",
  "tags": ["tech", "frontend"],
  "version_count": 1,
  "created_at": "2026-06-16T12:00:00Z",
  "updated_at": "2026-06-16T12:00:00Z",
  "_links": {
    "self": "/v1/resumes/res_8a7b6c5d"
  }
}
```

### 4.4 Update Resume

```
PUT /v1/resumes/{resume_id}
Authorization: Bearer <access_token>
```

Full replacement. Creates a new version automatically (see Section 8).

### 4.5 Patch Resume

```
PATCH /v1/resumes/{resume_id}
Authorization: Bearer <access_token>
```

Partial update. Does NOT create a new version. Use for metadata-only changes (status, tags, title).

**Request:**
```json
{
  "title": "Staff Frontend Engineer",
  "status": "complete",
  "tags": ["tech", "frontend", "staff-level"]
}
```

**Response** `200 OK`: Updated resume object.

### 4.6 Delete Resume

```
DELETE /v1/resumes/{resume_id}
Authorization: Bearer <access_token>
```

**Response** `204 No Content`. Soft-delete. Recoverable for 30 days.

### 4.7 Duplicate Resume

```
POST /v1/resumes/{resume_id}/duplicate
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "title": "Senior Frontend Engineer (Copy)"
}
```

**Response** `201 Created`: New resume object cloned from source.

### 4.8 Export Resume

```
GET /v1/resumes/{resume_id}/export
Authorization: Bearer <access_token>
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `pdf` | `pdf`, `docx`, `txt`, `json`, `latex` |
| `template_id` | string | resume's default | Override template |
| `include_cover_letter` | boolean | `false` | Append cover letter |
| `font_size` | string | `11pt` | `10pt`, `11pt`, `12pt` |
| `color_scheme` | string | `default` | `default`, `modern`, `classic`, `minimal` |

**Response** `200 OK`:
- `Content-Type: application/pdf` (or corresponding MIME type)
- `Content-Disposition: attachment; filename="Jane_Doe_Resume.pdf"`

For long-running exports, returns `202 Accepted` with a job ID for polling.

### 4.9 Compare Resumes

```
POST /v1/resumes/compare
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "resume_ids": ["res_8a7b6c5d", "res_1b2c3d4e"]
}
```

**Response** `200 OK`:
```json
{
  "resumes": [
    { "id": "res_8a7b6c5d", "title": "Senior Frontend Engineer", "ats_score": 87 },
    { "id": "res_1b2c3d4e", "title": "Frontend Lead", "ats_score": 72 }
  ],
  "comparison": {
    "score_difference": 15,
    "common_skills": ["React", "TypeScript", "Node.js"],
    "unique_to_res_8a7b6c5d": ["AWS", "Docker"],
    "unique_to_res_1b2c3d4e": ["Vue.js", "PHP"],
    "word_count_difference": -120
  }
}
```

---

## 5. Resume Parsing & Upload Endpoints

### 5.1 Upload & Parse Resume File

```
POST /v1/resumes/parse
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

**Request fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | binary | Yes | PDF, DOCX, TXT, RTF (max 10MB) |
| `title` | string | No | Resume title (defaults to filename) |
| `target_role` | string | No | Target job role |
| `language` | string | No | Source language for multi-lingual parsing (`en`, `zh`, `es`, `fr`, `de`, etc.) |
| `auto_analyze` | boolean | No | Immediately run ATS analysis after parsing (default: `true`) |

**Response** `201 Created`:
```json
{
  "id": "res_8a7b6c5d",
  "title": "Senior Frontend Engineer",
  "source_file": "Jane_Doe_Resume_2026.pdf",
  "source_format": "pdf",
  "status": "complete",
  "sections": {
    "contact": { ... },
    "summary": { ... },
    "experience": [ ... ],
    "education": [ ... ],
    "skills": { ... }
  },
  "parsing_metadata": {
    "confidence_score": 0.94,
    "sections_detected": ["contact", "summary", "experience", "education", "skills"],
    "total_experience_years": 8.5,
    "highest_degree": "bachelors",
    "warnings": ["Could not parse dates for one experience entry"]
  },
  "analysis": {
    "id": "anl_1a2b3c",
    "status": "queued"
  },
  "_links": {
    "self": "/v1/resumes/res_8a7b6c5d",
    "analysis": "/v1/analyses/anl_1a2b3c"
  }
}
```

### 5.2 Parse from URL

```
POST /v1/resumes/parse/url
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "url": "https://example.com/my-resume.pdf",
  "title": "Imported Resume",
  "auto_analyze": true
}
```

### 5.3 Parse from LinkedIn

```
POST /v1/resumes/parse/linkedin
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "linkedin_profile_url": "https://linkedin.com/in/janedoe",
  "title": "Jane Doe LinkedIn",
  "auto_analyze": true
}
```

OR

```json
{
  "linkedin_pdf_upload": "<base64_encoded_pdf>",
  "title": "Jane Doe LinkedIn Export",
  "auto_analyze": true
}
```

### 5.4 Get Parse Status

```
GET /v1/resumes/{resume_id}/parse-status
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "status": "processing",
  "progress": 65,
  "current_step": "Extracting skills section",
  "estimated_seconds_remaining": 3
}
```

### 5.5 Supported File Types

```
GET /v1/resumes/parse/supported-formats
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "formats": [
    { "extension": "pdf", "mime_type": "application/pdf", "max_size_mb": 10 },
    { "extension": "docx", "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "max_size_mb": 10 },
    { "extension": "txt", "mime_type": "text/plain", "max_size_mb": 5 },
    { "extension": "rtf", "mime_type": "application/rtf", "max_size_mb": 10 }
  ]
}
```

---

## 6. Job Description Endpoints

### 6.1 List Job Descriptions

```
GET /v1/job-descriptions
Authorization: Bearer <access_token>
```

**Query Parameters:** `page`, `per_page`, `sort`, `search`, `source` (`manual`, `url`, `linkedin`), `created_after`, `created_before`, `status`

**Response** `200 OK`:
```json
{
  "data": [
    {
      "id": "jd_7c8d9e0f",
      "title": "Staff Frontend Engineer",
      "company": "InnovateTech",
      "location": "San Francisco, CA (Remote)",
      "source": "url",
      "source_url": "https://jobs.example.com/12345",
      "status": "analyzed",
      "created_at": "2026-06-15T14:00:00Z",
      "_links": {
        "self": "/v1/job-descriptions/jd_7c8d9e0f",
        "analyze": "/v1/job-descriptions/jd_7c8d9e0f/analyze"
      }
    }
  ],
  "pagination": { "page": 1, "per_page": 20, "total": 3, "total_pages": 1, "has_next": false, "has_previous": false }
}
```

### 6.2 Create Job Description (Manual)

```
POST /v1/job-descriptions
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "title": "Staff Frontend Engineer",
  "company": "InnovateTech",
  "location": "San Francisco, CA (Remote)",
  "description_text": "We are looking for a Staff Frontend Engineer to lead our design system efforts...",
  "requirements": {
    "must_have": ["7+ years React", "TypeScript expertise", "Design systems"],
    "nice_to_have": ["GraphQL", "WebAssembly", "Accessibility certifications"]
  },
  "salary_range": {
    "min": 180000,
    "max": 240000,
    "currency": "USD",
    "period": "yearly"
  },
  "employment_type": "full_time",
  "remote_policy": "remote",
  "tags": ["frontend", "staff-level", "react"]
}
```

### 6.3 Parse Job Description from URL

```
POST /v1/job-descriptions/parse
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "url": "https://jobs.example.com/12345"
}
```

Automatically extracts title, company, location, requirements, responsibilities, and qualifications using NLP.

### 6.4 Get Job Description

```
GET /v1/job-descriptions/{jd_id}
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "id": "jd_7c8d9e0f",
  "title": "Staff Frontend Engineer",
  "company": "InnovateTech",
  "location": "San Francisco, CA (Remote)",
  "description_text": "We are looking for...",
  "requirements": {
    "must_have": ["7+ years React", "TypeScript expertise", "Design systems"],
    "nice_to_have": ["GraphQL", "WebAssembly"]
  },
  "responsibilities": [
    "Lead the design system team",
    "Define frontend architecture standards",
    "Mentor senior engineers"
  ],
  "extracted_keywords": [
    { "keyword": "React", "weight": 0.95, "category": "skill" },
    { "keyword": "design systems", "weight": 0.90, "category": "skill" },
    { "keyword": "leadership", "weight": 0.85, "category": "soft_skill" },
    { "keyword": "accessibility", "weight": 0.70, "category": "skill" }
  ],
  "salary_range": { "min": 180000, "max": 240000, "currency": "USD", "period": "yearly" },
  "employment_type": "full_time",
  "remote_policy": "remote",
  "source": "url",
  "source_url": "https://jobs.example.com/12345",
  "tags": ["frontend", "staff-level", "react"],
  "created_at": "2026-06-15T14:00:00Z",
  "_links": {
    "self": "/v1/job-descriptions/jd_7c8d9e0f",
    "match": "/v1/job-descriptions/jd_7c8d9e0f/match",
    "analyze": "/v1/job-descriptions/jd_7c8d9e0f/analyze"
  }
}
```

### 6.5 Update Job Description

```
PUT /v1/job-descriptions/{jd_id}
```
```
PATCH /v1/job-descriptions/{jd_id}
```

### 6.6 Delete Job Description

```
DELETE /v1/job-descriptions/{jd_id}
Authorization: Bearer <access_token>
```

### 6.7 Find Matching Resumes

```
GET /v1/job-descriptions/{jd_id}/match
Authorization: Bearer <access_token>
```

**Query Parameters:** `page`, `per_page`, `min_score` (0-100), `sort` (default: `-match_score`)

**Response** `200 OK`:
```json
{
  "job_description": {
    "id": "jd_7c8d9e0f",
    "title": "Staff Frontend Engineer",
    "company": "InnovateTech"
  },
  "matches": [
    {
      "resume_id": "res_8a7b6c5d",
      "resume_title": "Senior Frontend Engineer",
      "match_score": 92,
      "skill_overlap": {
        "matched": ["React", "TypeScript", "Design Systems", "Mentoring"],
        "missing": ["GraphQL", "WebAssembly"],
        "partial": ["Accessibility"]
      },
      "experience_gap": "1 year below requested 10+ years",
      "recommendation": "Strong match. Address GraphQL gap with a quick learning note.",
      "_links": {
        "resume": "/v1/resumes/res_8a7b6c5d",
        "tailor": "/v1/resumes/res_8a7b6c5d/tailor"
      }
    }
  ],
  "pagination": { ... }
}
```

---

## 7. Analysis Endpoints

### 7.1 ATS Score Analysis

```
POST /v1/resumes/{resume_id}/analyze
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "job_description_id": "jd_7c8d9e0f",
  "analysis_types": ["ats_score", "keyword_match", "format_check", "readability"]
}
```

**Response** `202 Accepted` (async processing):
```json
{
  "analysis_id": "anl_3f4a5c6b",
  "status": "queued",
  "estimated_seconds": 8,
  "_links": {
    "self": "/v1/analyses/anl_3f4a5c6b",
    "result": "/v1/analyses/anl_3f4a5c6b/result"
  }
}
```

### 7.2 Get Analysis Result

```
GET /v1/analyses/{analysis_id}
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "id": "anl_3f4a5c6b",
  "resume_id": "res_8a7b6c5d",
  "job_description_id": "jd_7c8d9e0f",
  "status": "complete",
  "results": {
    "ats_score": {
      "overall": 87,
      "breakdown": {
        "keyword_match": 90,
        "format_compatibility": 95,
        "section_completeness": 85,
        "readability": 78,
        "quantifiable_achievements": 88
      }
    },
    "keyword_analysis": {
      "matched_keywords": [
        { "keyword": "React", "count": 5, "context": "experience", "weight": 0.95 },
        { "keyword": "TypeScript", "count": 3, "context": "skills", "weight": 0.80 }
      ],
      "missing_keywords": [
        { "keyword": "GraphQL", "weight": 0.75, "suggestion": "Add to skills section or mention in a project" },
        { "keyword": "WebAssembly", "weight": 0.40, "suggestion": "Consider adding if you have relevant experience" }
      ],
      "keyword_density_issues": [
        { "keyword": "React", "count": 5, "recommendation": "Good density" }
      ]
    },
    "format_checks": {
      "is_ats_friendly": true,
      "issues": [],
      "warnings": [
        { "severity": "low", "message": "Consider using standard section headings (Experience, Education, Skills)" }
      ],
      "passes": [
        "No images or graphics detected",
        "Standard fonts used",
        "No tables detected",
        "Single-column layout",
        "File size within limits"
      ]
    },
    "readability": {
      "flesch_kincaid_grade": 10.2,
      "flesch_reading_ease": 52.3,
      "average_sentence_length": 18.5,
      "passive_voice_percentage": 12,
      "action_verb_usage": "Good — 73% of bullets start with action verbs",
      "suggestions": [
        "Reduce passive voice in experience section (currently 12%, target <10%)",
        "Vary sentence openings for better flow"
      ]
    },
    "improvement_plan": [
      {
        "priority": "high",
        "category": "keywords",
        "action": "Add GraphQL to skills or a project bullet point",
        "impact": "+5 ATS score estimated"
      },
      {
        "priority": "medium",
        "category": "formatting",
        "action": "Rename 'What I Did' section to 'Experience' for better ATS parsing",
        "impact": "+2 ATS score estimated"
      },
      {
        "priority": "low",
        "category": "content",
        "action": "Add more quantifiable metrics — 3 of 8 experience bullets lack numbers",
        "impact": "+3 ATS score estimated"
      }
    ]
  },
  "created_at": "2026-06-16T12:00:00Z",
  "completed_at": "2026-06-16T12:00:08Z",
  "_links": {
    "self": "/v1/analyses/anl_3f4a5c6b",
    "resume": "/v1/resumes/res_8a7b6c5d",
    "job_description": "/v1/job-descriptions/jd_7c8d9e0f"
  }
}
```

### 7.3 Skill Gap Analysis

```
POST /v1/analyses/skill-gap
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "resume_id": "res_8a7b6c5d",
  "job_description_id": "jd_7c8d9e0f",
  "target_role": "Staff Frontend Engineer"
}
```

**Response** `200 OK`:
```json
{
  "id": "anl_5g6h7i8j",
  "status": "complete",
  "skill_gaps": {
    "critical_gaps": [
      {
        "skill": "GraphQL",
        "importance": "high",
        "market_demand": "growing",
        "estimated_learning_time": "2-4 weeks",
        "recommended_resources": [
          { "title": "GraphQL Official Tutorial", "url": "https://graphql.org/learn/", "type": "free" }
        ]
      }
    ],
    "moderate_gaps": [
      {
        "skill": "WebAssembly",
        "importance": "medium",
        "market_demand": "emerging",
        "estimated_learning_time": "4-8 weeks"
      }
    ],
    "strength_areas": [
      { "skill": "React", "proficiency": "expert", "years": 8 },
      { "skill": "TypeScript", "proficiency": "expert", "years": 6 },
      { "skill": "Design Systems", "proficiency": "advanced", "years": 4 }
    ]
  },
  "career_recommendations": [
    "You are 1-2 years from Staff Engineer readiness based on current skill profile",
    "Focus on architectural decision-making and cross-team influence patterns"
  ]
}
```

### 7.4 Resume Optimization

```
POST /v1/resumes/{resume_id}/optimize
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "job_description_id": "jd_7c8d9e0f",
  "optimization_areas": ["keywords", "bullets", "summary", "skills"],
  "aggressiveness": "moderate"
}
```

`aggressiveness`: `conservative` (minor tweaks), `moderate` (rephrase, reorder, suggest additions), `aggressive` (full rewrite of sections)

**Response** `200 OK`:
```json
{
  "optimization_id": "opt_8h7g6f5e",
  "status": "complete",
  "changes": [
    {
      "section": "summary",
      "type": "rewrite",
      "original": "Experienced frontend engineer with 8+ years...",
      "optimized": "Staff-level frontend engineer with 8+ years architecting design systems and leading cross-functional teams to deliver performant web applications at scale.",
      "rationale": "Added leadership language and 'architecting' to match job description tone",
      "impact": "medium"
    },
    {
      "section": "experience.0.bullets.0",
      "type": "enhance",
      "original": "Led migration from AngularJS to React",
      "optimized": "Architected and led migration from AngularJS to React for a 50+ engineer organization, reducing bundle size by 40% and improving Core Web Vitals LCP by 200ms",
      "rationale": "Added scale indicator and quantifiable impact",
      "impact": "high"
    },
    {
      "section": "skills.frameworks",
      "type": "add",
      "additions": ["GraphQL (learning)"],
      "rationale": "Addresses critical missing keyword. Mark as 'learning' to maintain honesty.",
      "impact": "high"
    }
  ],
  "estimated_score_improvement": {
    "before": 87,
    "after": 94,
    "delta": 7
  },
  "applied": false,
  "_links": {
    "apply": "/v1/resumes/res_8a7b6c5d/optimize/opt_8h7g6f5e/apply",
    "discard": "/v1/resumes/res_8a7b6c5d/optimize/opt_8h7g6f5e/discard"
  }
}
```

### 7.5 Apply Optimization

```
POST /v1/resumes/{resume_id}/optimize/{optimization_id}/apply
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "accepted_changes": ["summary", "experience.0.bullets.0", "skills.frameworks"]
}
```

**Response** `200 OK`: Creates a new resume version with applied changes.

### 7.6 Bulk Analysis

```
POST /v1/analyses/bulk
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "resume_ids": ["res_8a7b6c5d", "res_1b2c3d4e"],
  "job_description_id": "jd_7c8d9e0f"
}
```

**Response** `202 Accepted`:
```json
{
  "batch_id": "bat_7d6e5f4g",
  "analyses": [
    { "resume_id": "res_8a7b6c5d", "analysis_id": "anl_3f4a5c6b", "status": "queued" },
    { "resume_id": "res_1b2c3d4e", "analysis_id": "anl_9i0j1k2l", "status": "queued" }
  ]
}
```

### 7.7 Get Batch Analysis Status

```
GET /v1/analyses/batches/{batch_id}
Authorization: Bearer <access_token>
```

### 7.8 Tailor Resume for a Job

```
POST /v1/resumes/{resume_id}/tailor
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "job_description_id": "jd_7c8d9e0f",
  "options": {
    "reorder_experience": true,
    "emphasize_matching_skills": true,
    "rewrite_summary": true,
    "add_missing_keywords": true,
    "adjust_bullets_to_jd_tone": true,
    "max_changes": 15
  }
}
```

**Response** `200 OK`:
```json
{
  "tailored_resume_id": "res_tlr_1a2b3c",
  "parent_resume_id": "res_8a7b6c5d",
  "changes_summary": {
    "bullets_enhanced": 6,
    "skills_added": 2,
    "summary_rewritten": true,
    "experience_reordered": true,
    "estimated_ats_improvement": 12
  },
  "_links": {
    "self": "/v1/resumes/res_tlr_1a2b3c",
    "preview": "/v1/resumes/res_tlr_1a2b3c/export?format=pdf",
    "approve": "/v1/resumes/res_tlr_1a2b3c/accept-tailored",
    "discard": "/v1/resumes/res_tlr_1a2b3c"
  }
}
```

---

## 8. History & Version Management Endpoints

Every `PUT /v1/resumes/{id}` call automatically creates a version. Explicit versioning is also supported.

### 8.1 List Resume Versions

```
GET /v1/resumes/{resume_id}/versions
Authorization: Bearer <access_token>
```

**Query Parameters:** `page`, `per_page`

**Response** `200 OK`:
```json
{
  "data": [
    {
      "version": 3,
      "id": "ver_7f8e9d0c",
      "change_summary": "Updated summary and experience bullets for Staff role",
      "changes": {
        "sections_modified": ["summary", "experience.0", "skills"],
        "lines_added": 12,
        "lines_removed": 5
      },
      "ats_score": 94,
      "created_at": "2026-06-16T12:00:00Z",
      "_links": {
        "self": "/v1/resumes/res_8a7b6c5d/versions/ver_7f8e9d0c",
        "diff": "/v1/resumes/res_8a7b6c5d/versions/ver_7f8e9d0c/diff?against=2",
        "restore": "/v1/resumes/res_8a7b6c5d/versions/ver_7f8e9d0c/restore"
      }
    },
    {
      "version": 2,
      "id": "ver_8a9b0c1d",
      "change_summary": "Initial ATS optimization pass",
      "ats_score": 87,
      "created_at": "2026-06-12T15:30:00Z",
      "_links": { ... }
    },
    {
      "version": 1,
      "id": "ver_9b0c1d2e",
      "change_summary": "Initial resume creation",
      "ats_score": 72,
      "created_at": "2026-06-10T10:00:00Z",
      "_links": { ... }
    }
  ],
  "pagination": { ... }
}
```

### 8.2 Get Specific Version

```
GET /v1/resumes/{resume_id}/versions/{version_id}
Authorization: Bearer <access_token>
```

Returns the full resume as it existed at that version.

### 8.3 Diff Two Versions

```
GET /v1/resumes/{resume_id}/versions/{version_id}/diff?against={base_version_id}
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "base_version": 2,
  "target_version": 3,
  "diff": [
    {
      "section": "summary.text",
      "type": "modified",
      "old": "Experienced frontend engineer...",
      "new": "Staff-level frontend engineer..."
    },
    {
      "section": "experience.0.bullets.0",
      "type": "modified",
      "old": "Led migration from AngularJS to React",
      "new": "Architected and led migration from AngularJS to React for a 50+ engineer organization, reducing bundle size by 40%..."
    },
    {
      "section": "skills.frameworks",
      "type": "added",
      "new": ["GraphQL (learning)"]
    }
  ],
  "stats": {
    "sections_modified": 3,
    "lines_added": 12,
    "lines_removed": 5,
    "ats_score_change": 7
  }
}
```

### 8.4 Restore Version

```
POST /v1/resumes/{resume_id}/versions/{version_id}/restore
Authorization: Bearer <access_token>
```

Creates a NEW version that is a copy of the specified historical version (never mutates history).

**Response** `201 Created`:
```json
{
  "version": 4,
  "id": "ver_new123",
  "restored_from_version": 1,
  "created_at": "2026-06-16T12:30:00Z",
  "_links": {
    "self": "/v1/resumes/res_8a7b6c5d/versions/ver_new123"
  }
}
```

### 8.5 Activity History

```
GET /v1/resumes/{resume_id}/history
Authorization: Bearer <access_token>
```

**Query Parameters:** `page`, `per_page`, `event_type` (`created`, `updated`, `analyzed`, `optimized`, `exported`, `tailored`, `version_restored`)

**Response** `200 OK`:
```json
{
  "data": [
    {
      "id": "evt_1a2b3c4d",
      "event_type": "analyzed",
      "description": "ATS analysis completed — score 94",
      "actor": "user",
      "metadata": {
        "analysis_id": "anl_3f4a5c6b",
        "ats_score": 94,
        "job_description_id": "jd_7c8d9e0f"
      },
      "created_at": "2026-06-16T12:00:08Z"
    },
    {
      "id": "evt_9z8y7x6w",
      "event_type": "exported",
      "description": "Resume exported as PDF",
      "metadata": { "format": "pdf", "template_id": "tpl_professional" },
      "created_at": "2026-06-15T09:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

### 8.6 Global Activity Feed

```
GET /v1/history
Authorization: Bearer <access_token>
```

**Query Parameters:** `page`, `per_page`, `event_type`, `resume_id`, `created_after`, `created_before`

Returns all events across all resumes for the authenticated user.

---

## 9. Template Endpoints

### 9.1 List Templates

```
GET /v1/templates
Authorization: Bearer <access_token>
```

**Query Parameters:** `page`, `per_page`, `category` (`professional`, `creative`, `academic`, `technical`, `executive`), `is_premium`

**Response** `200 OK`:
```json
{
  "data": [
    {
      "id": "tpl_professional",
      "name": "Professional",
      "category": "professional",
      "description": "Clean, ATS-optimized layout suitable for most industries",
      "thumbnail_url": "https://cdn.resumepilot.ai/templates/professional.png",
      "preview_urls": [
        "https://cdn.resumepilot.ai/templates/professional_page1.png",
        "https://cdn.resumepilot.ai/templates/professional_page2.png"
      ],
      "is_premium": false,
      "is_ats_friendly": true,
      "supported_sections": ["contact", "summary", "experience", "education", "skills", "certifications", "projects", "languages_spoken"],
      "color_schemes": ["default", "modern", "classic"],
      "font_options": ["default", "serif", "sans-serif"],
      "created_at": "2026-01-01T00:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

### 9.2 Get Template

```
GET /v1/templates/{template_id}
Authorization: Bearer <access_token>
```

### 9.3 Preview Template with Resume

```
GET /v1/templates/{template_id}/preview?resume_id=res_8a7b6c5d
Authorization: Bearer <access_token>
```

Returns a rendered preview image (PNG) of the resume in the specified template.

---

## 10. Subscription & Billing Endpoints

### 10.1 Get Plans

```
GET /v1/plans
```

Public endpoint. No auth required.

**Response** `200 OK`:
```json
{
  "data": [
    {
      "id": "plan_free",
      "name": "Free",
      "price_monthly_usd": 0,
      "features": {
        "resume_limit": 2,
        "analyses_per_month": 3,
        "exports_per_month": 5,
        "templates": "free_only",
        "ai_optimization": false,
        "cover_letters": false,
        "linkedin_import": false
      }
    },
    {
      "id": "plan_pro",
      "name": "Professional",
      "price_monthly_usd": 19.99,
      "price_yearly_usd": 179.99,
      "features": {
        "resume_limit": "unlimited",
        "analyses_per_month": "unlimited",
        "exports_per_month": "unlimited",
        "templates": "all",
        "ai_optimization": true,
        "cover_letters": true,
        "linkedin_import": true,
        "priority_support": true
      }
    },
    {
      "id": "plan_enterprise",
      "name": "Enterprise",
      "price_monthly_usd": null,
      "features": {
        "resume_limit": "unlimited",
        "analyses_per_month": "unlimited",
        "exports_per_month": "unlimited",
        "templates": "all",
        "ai_optimization": true,
        "cover_letters": true,
        "linkedin_import": true,
        "priority_support": true,
        "team_accounts": true,
        "custom_templates": true,
        "sso": true,
        "api_access": true,
        "dedicated_support": true,
        "sla": "99.9% uptime"
      }
    }
  ]
}
```

### 10.2 Get Current Subscription

```
GET /v1/subscriptions/me
Authorization: Bearer <access_token>
```

### 10.3 Create/Update Subscription

```
POST /v1/subscriptions
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "plan_id": "plan_pro",
  "billing_cycle": "monthly",
  "payment_method_id": "pm_1a2b3c4d"
}
```

### 10.4 Cancel Subscription

```
POST /v1/subscriptions/me/cancel
Authorization: Bearer <access_token>
```

### 10.5 Payment Methods

```
GET /v1/payment-methods
Authorization: Bearer <access_token>
```

```
POST /v1/payment-methods
DELETE /v1/payment-methods/{pm_id}
```

### 10.6 Billing History

```
GET /v1/billing/invoices
Authorization: Bearer <access_token>
```

### 10.7 Usage Stats

```
GET /v1/usage
Authorization: Bearer <access_token>
```

**Response** `200 OK`:
```json
{
  "current_period": {
    "start": "2026-06-01T00:00:00Z",
    "end": "2026-07-01T00:00:00Z"
  },
  "usage": {
    "analyses_used": 12,
    "analyses_limit": "unlimited",
    "exports_used": 8,
    "exports_limit": "unlimited",
    "resumes_created": 5,
    "resumes_limit": "unlimited",
    "storage_used_bytes": 15728640,
    "storage_limit_bytes": 1073741824
  }
}
```

---

## 11. Cover Letter Endpoints

### 11.1 Generate Cover Letter

```
POST /v1/cover-letters/generate
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "resume_id": "res_8a7b6c5d",
  "job_description_id": "jd_7c8d9e0f",
  "options": {
    "tone": "professional",
    "length": "medium",
    "highlight_skills": ["React", "Design Systems"],
    "custom_instructions": "Mention my open-source contributions"
  }
}
```

### 11.2 List Cover Letters

```
GET /v1/cover-letters
Authorization: Bearer <access_token>
```

### 11.3 Get Cover Letter

```
GET /v1/cover-letters/{cl_id}
Authorization: Bearer <access_token>
```

### 11.4 Update Cover Letter

```
PUT /v1/cover-letters/{cl_id}
```
```
PATCH /v1/cover-letters/{cl_id}
```

### 11.5 Delete Cover Letter

```
DELETE /v1/cover-letters/{cl_id}
```

### 11.6 Export Cover Letter

```
GET /v1/cover-letters/{cl_id}/export?format=pdf
Authorization: Bearer <access_token>
```

---

## 12. Admin Endpoints

All admin endpoints require the `admin` scope and are prefixed with `/v1/admin`.

### 12.1 Dashboard Stats

```
GET /v1/admin/stats
Authorization: Bearer <access_token>
X-Admin-Key: <admin_key>
```

**Response** `200 OK`:
```json
{
  "users": {
    "total": 12500,
    "active_30d": 8400,
    "new_today": 45,
    "new_this_week": 310,
    "by_plan": { "free": 8000, "pro": 4200, "enterprise": 300 }
  },
  "resumes": {
    "total": 38000,
    "created_today": 180,
    "analyses_run_today": 520,
    "exports_today": 230
  },
  "revenue": {
    "mrr": 98450.00,
    "arr": 1181400.00,
    "today": 3200.00,
    "this_month": 98450.00
  },
  "system": {
    "api_latency_p95_ms": 245,
    "error_rate_1h": 0.02,
    "uptime_percent_30d": 99.97
  }
}
```

### 12.2 List Users (Admin)

```
GET /v1/admin/users
Authorization: Bearer <access_token>
X-Admin-Key: <admin_key>
```

**Query Parameters:** `page`, `per_page`, `search`, `plan`, `status` (`active`, `suspended`, `deleted`), `created_after`, `created_before`, `sort`

### 12.3 Get User (Admin)

```
GET /v1/admin/users/{user_id}
Authorization: Bearer <access_token>
X-Admin-Key: <admin_key>
```

### 12.4 Suspend / Unsuspend User

```
POST /v1/admin/users/{user_id}/suspend
POST /v1/admin/users/{user_id}/unsuspend
Authorization: Bearer <access_token>
X-Admin-Key: <admin_key>
```

**Request:**
```json
{
  "reason": "Terms of Service violation — multiple fraudulent chargebacks"
}
```

### 12.5 Impersonate User

```
POST /v1/admin/users/{user_id}/impersonate
Authorization: Bearer <access_token>
X-Admin-Key: <admin_key>
```

**Response** `200 OK`:
```json
{
  "access_token": "<user_scoped_jwt>",
  "user_id": "usr_3fa2b1c84e",
  "impersonation_id": "imp_a1b2c3d4",
  "expires_in": 3600
}
```

All actions taken during impersonation are logged with both the admin and user IDs.

### 12.6 System Configuration

```
GET /v1/admin/config
PUT /v1/admin/config
Authorization: Bearer <access_token>
X-Admin-Key: <admin_key>
```

**Configurable settings:**
- Rate limit thresholds
- File upload size limits
- AI model parameters
- Feature flags
- Maintenance mode toggle

### 12.7 Analytics Export

```
GET /v1/admin/analytics/export?from=2026-05-01&to=2026-06-01&granularity=day&metrics=users,revenue,analyses
Authorization: Bearer <access_token>
X-Admin-Key: <admin_key>
```

**Response** `200 OK`: CSV or JSON (via `Accept` header).

### 12.8 Audit Log

```
GET /v1/admin/audit-logs
Authorization: Bearer <access_token>
X-Admin-Key: <admin_key>
```

**Query Parameters:** `page`, `per_page`, `user_id`, `action`, `resource_type`, `created_after`, `created_before`

### 12.9 Manage Templates (Admin)

```
POST /v1/admin/templates
PUT /v1/admin/templates/{template_id}
DELETE /v1/admin/templates/{template_id}
```

### 12.10 System Health

```
GET /v1/admin/health
Authorization: Bearer <access_token>
X-Admin-Key: <admin_key>
```

Returns DB connectivity, Redis status, queue depth, AI service status, storage service status.

---

## 13. Webhook Endpoints

### 13.1 Register Webhook

```
POST /v1/webhooks
Authorization: Bearer <access_token>
```

**Request:**
```json
{
  "url": "https://myapp.example.com/webhooks/resumepilot",
  "events": ["analysis.completed", "resume.exported", "subscription.updated"],
  "secret": "whsec_<auto_generated_or_user_provided>",
  "description": "Notify our ATS when analysis is done",
  "is_active": true
}
```

### 13.2 List Webhooks

```
GET /v1/webhooks
Authorization: Bearer <access_token>
```

### 13.3 Get Webhook

```
GET /v1/webhooks/{webhook_id}
Authorization: Bearer <access_token>
```

### 13.4 Update Webhook

```
PATCH /v1/webhooks/{webhook_id}
Authorization: Bearer <access_token>
```

### 13.5 Delete Webhook

```
DELETE /v1/webhooks/{webhook_id}
Authorization: Bearer <access_token>
```

### 13.6 Webhook Delivery Logs

```
GET /v1/webhooks/{webhook_id}/deliveries
Authorization: Bearer <access_token>
```

**Query Parameters:** `page`, `per_page`, `status` (`success`, `failed`, `pending`)

**Response** `200 OK`:
```json
{
  "data": [
    {
      "id": "wdl_1a2b3c",
      "event": "analysis.completed",
      "status": "success",
      "status_code": 200,
      "request_url": "https://myapp.example.com/webhooks/resumepilot",
      "request_payload_hash": "sha256:abc123...",
      "response_body": "{\"received\":true}",
      "duration_ms": 312,
      "attempts": 1,
      "created_at": "2026-06-16T12:00:10Z"
    }
  ],
  "pagination": { ... }
}
```

### 13.7 Retry Failed Delivery

```
POST /v1/webhooks/{webhook_id}/deliveries/{delivery_id}/retry
Authorization: Bearer <access_token>
```

### 13.8 Webhook Event Types

| Event | Payload Resource | Description |
|-------|-----------------|-------------|
| `analysis.completed` | `analysis` | ATS analysis finished |
| `analysis.failed` | `analysis` | ATS analysis errored |
| `resume.created` | `resume` | New resume created |
| `resume.updated` | `resume` | Resume content updated |
| `resume.exported` | `resume` + `export_format` | Resume exported |
| `resume.parsed` | `resume` | File parsing complete |
| `optimization.completed` | `optimization` | AI optimization ready |
| `cover_letter.generated` | `cover_letter` | Cover letter generated |
| `subscription.created` | `subscription` | New subscription |
| `subscription.updated` | `subscription` | Plan/billing change |
| `subscription.canceled` | `subscription` | Subscription ended |
| `subscription.payment_failed` | `subscription` | Payment failure alert |
| `user.registered` | `user` | New registration |

### 13.9 Webhook Signature Verification

Every webhook request includes headers:

```
X-ResumePilot-Webhook-ID: wdl_1a2b3c
X-ResumePilot-Webhook-Signature: t=1686921600,v1=sha256hmac...
X-ResumePilot-Webhook-Event: analysis.completed
```

Signature is computed as `HMAC-SHA256(secret, "${timestamp}.${payload}")`. Clients MUST verify before processing.

---

## 14. Shared Standards

### 14.1 Pagination

Cursor-based pagination available for real-time feeds; offset-based for all list endpoints.

**Offset-based (default):**
```
GET /v1/resumes?page=1&per_page=20
```

**Cursor-based (for feeds / infinite scroll):**
```
GET /v1/history?cursor=evt_1a2b3c4d&limit=20
```

Response for cursor-based:
```json
{
  "data": [ ... ],
  "pagination": {
    "cursor": "evt_9z8y7x6w",
    "has_more": true,
    "next_cursor": "evt_9z8y7x6w"
  }
}
```

### 14.2 Filtering

| Syntax | Example | Meaning |
|--------|---------|---------|
| Equality | `?status=draft` | status = 'draft' |
| Range | `?ats_score_min=70&ats_score_max=100` | 70 <= score <= 100 |
| Date range | `?created_after=2026-06-01T00:00:00Z&created_before=2026-06-30T23:59:59Z` | June 2026 |
| Multi-value | `?tag=tech&tag=management` | tag IN ('tech', 'management') |
| Search | `?search=React+Engineer` | Full-text search |

### 14.3 Sorting

```
?sort=-updated_at          # descending
?sort=title                # ascending
?sort=-ats_score,created_at  # multi-field (desc by score, then asc by date)
```

Valid sort fields per resource are documented in each endpoint. Invalid fields return `400 Bad Request`.

### 14.4 Field Selection (Sparse Fieldsets)

```
GET /v1/resumes?fields=id,title,ats_score,updated_at
```

Reduces payload size for list views. Only top-level fields are filterable.

### 14.5 Rate Limiting

| Plan | Requests per minute | Burst |
|------|--------------------|-------|
| Free | 60 | 10 |
| Pro | 300 | 50 |
| Enterprise | 1000+ | 200 |
| Admin | 600 | 100 |

Rate limit info is returned in response headers:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 287
X-RateLimit-Reset: 1686921660
X-RateLimit-Reset-After: 42
Retry-After: 42
```

When exceeded, returns `429 Too Many Requests`:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please retry in 42 seconds.",
    "retry_after_seconds": 42
  }
}
```

### 14.6 Idempotency

For `POST` endpoints that create resources, clients can send:

```
Idempotency-Key: <unique_client_generated_uuid>
```

The server stores the response for 24 hours. Replaying the same key returns the original response without side effects.

---

## 15. Error Handling

### 15.1 Error Response Format

All errors follow a consistent structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid parameters.",
    "request_id": "req_a1b2c3d4e5f6",
    "timestamp": "2026-06-16T12:00:00Z",
    "details": [
      {
        "field": "email",
        "code": "invalid_format",
        "message": "Must be a valid email address"
      },
      {
        "field": "password",
        "code": "too_weak",
        "message": "Password must be at least 8 characters with uppercase, lowercase, digit, and special character"
      }
    ],
    "documentation_url": "https://docs.resumepilot.ai/errors#VALIDATION_ERROR"
  }
}
```

### 15.2 HTTP Status Codes

| Status | Usage |
|--------|-------|
| `200 OK` | Successful GET, PUT, PATCH |
| `201 Created` | Successful POST (resource created) |
| `202 Accepted` | Async operation queued |
| `204 No Content` | Successful DELETE |
| `400 Bad Request` | Malformed request, validation failure |
| `401 Unauthorized` | Missing or invalid authentication |
| `403 Forbidden` | Authenticated but insufficient permissions |
| `404 Not Found` | Resource does not exist |
| `409 Conflict` | Resource state conflict (e.g., duplicate email) |
| `413 Payload Too Large` | Upload exceeds size limit |
| `415 Unsupported Media Type` | Invalid Content-Type |
| `422 Unprocessable Entity` | Valid syntax but semantic error (e.g., parsing failed) |
| `429 Too Many Requests` | Rate limit exceeded |
| `500 Internal Server Error` | Unhandled server error |
| `502 Bad Gateway` | Upstream AI service failure |
| `503 Service Unavailable` | Maintenance mode or overload |

### 15.3 Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | Input validation failed |
| `AUTHENTICATION_REQUIRED` | 401 | No valid credentials |
| `INVALID_TOKEN` | 401 | JWT expired or malformed |
| `INSUFFICIENT_PERMISSIONS` | 403 | Scope/role insufficient |
| `RESOURCE_NOT_FOUND` | 404 | ID does not exist |
| `EMAIL_ALREADY_EXISTS` | 409 | Duplicate registration |
| `PLAN_LIMIT_REACHED` | 403 | Free tier limit exceeded |
| `FILE_TOO_LARGE` | 413 | Upload exceeds max size |
| `UNSUPPORTED_FILE_FORMAT` | 415 | File type not supported |
| `PARSE_FAILED` | 422 | Resume parsing failed |
| `ANALYSIS_FAILED` | 422 | AI analysis could not complete |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `AI_SERVICE_UNAVAILABLE` | 502 | AI provider down |
| `MAINTENANCE_MODE` | 503 | Scheduled maintenance |

---

## 16. API Documentation Approach

### 16.1 OpenAPI 3.1 Specification

The complete API is documented using OpenAPI 3.1. The spec file lives at:

```
https://api.resumepilot.ai/v1/openapi.json
```

### 16.2 Developer Portal

Hosted at `https://docs.resumepilot.ai` with:
- Interactive API reference (Swagger UI / Scalar)
- Authentication guide with code samples (cURL, Python, JavaScript, Go)
- Changelog per version
- Rate limiting guide
- Webhook guide with signature verification examples
- SDK documentation

### 16.3 SDKs

Official SDKs for:
- **Python:** `pip install resumepilot`
- **JavaScript/TypeScript:** `npm install resumepilot`
- **Go:** `go get github.com/resumepilot/resumepilot-go`

### 16.4 OpenAPI Generation Pipeline

```
api-spec.yaml (source of truth)
    ├── → OpenAPI JSON (published at /v1/openapi.json)
    ├── → TypeScript types (shared between frontend and backend)
    ├── → JSON Schema (used for server-side request validation)
    ├── → SDK code generation (Python, JS, Go)
    └── → Postman collection (published on Postman Workspace)
```

### 16.5 Health / Status

```
GET /v1/health
```

Public endpoint. Returns `200 OK` with basic status.

```
GET /v1/health/detailed
```

Requires admin scope. Returns DB, Redis, queue, AI service statuses.

---

## 17. Data Models (Additional Schemas)

### 17.1 User

```
id: string (usr_<12 hex>)
email: string
first_name: string
last_name: string
avatar_url: string | null
email_verified: boolean
plan: "free" | "pro" | "enterprise"
plan_expires_at: ISO8601 | null
credits_remaining: integer
preferences: UserPreferences
created_at: ISO8601
updated_at: ISO8601
```

### 17.2 Resume

```
id: string (res_<8 hex>)
user_id: string
title: string
target_role: string | null
status: "draft" | "complete" | "archived"
template_id: string
sections: ResumeSections
metadata: ResumeMetadata
tags: string[]
created_at: ISO8601
updated_at: ISO8601
deleted_at: ISO8601 | null
```

### 17.3 ResumeVersion

```
id: string (ver_<8 hex>)
resume_id: string
version: integer
snapshot: Resume (full copy)
change_summary: string
changes: { sections_modified: string[], lines_added: integer, lines_removed: integer }
ats_score: integer | null
created_at: ISO8601
```

### 17.4 JobDescription

```
id: string (jd_<8 hex>)
user_id: string
title: string
company: string | null
location: string | null
description_text: string
requirements: { must_have: string[], nice_to_have: string[] }
responsibilities: string[]
extracted_keywords: ExtractedKeyword[]
salary_range: SalaryRange | null
employment_type: string | null
remote_policy: string | null
source: "manual" | "url" | "linkedin"
source_url: string | null
tags: string[]
created_at: ISO8601
updated_at: ISO8601
```

### 17.5 Analysis

```
id: string (anl_<8 hex>)
resume_id: string
job_description_id: string | null
status: "queued" | "processing" | "complete" | "failed"
results: AnalysisResults | null
error_message: string | null
created_at: ISO8601
completed_at: ISO8601 | null
```

### 17.6 OptimizationResult

```
id: string (opt_<8 hex>)
resume_id: string
analysis_id: string
changes: OptimizationChange[]
estimated_score_improvement: { before: integer, after: integer, delta: integer }
applied: boolean
created_at: ISO8601
```

### 17.7 CoverLetter

```
id: string (cl_<8 hex>)
user_id: string
resume_id: string
job_description_id: string
title: string
content: string
header: { date: string, recipient_name: string, recipient_title: string, company: string, address: string }
options: { tone: string, length: string }
created_at: ISO8601
updated_at: ISO8601
```

### 17.8 Webhook

```
id: string (wh_<8 hex>)
user_id: string
url: string
events: string[]
secret_hash: string
description: string
is_active: boolean
created_at: ISO8601
updated_at: ISO8601
```

### 17.9 APIKey

```
id: string (key_<8 hex>)
user_id: string
name: string
prefix: string
key_hash: string
scopes: string[]
last_used_at: ISO8601 | null
expires_at: ISO8601
created_at: ISO8601
revoked_at: ISO8601 | null
```

---

## 18. Authentication & Security Standards

### 18.1 Token Storage (Client Guidance)

- **Web apps:** Store access token in memory only. Store refresh token in an `httpOnly`, `Secure`, `SameSite=Strict` cookie.
- **Mobile apps:** Store tokens in OS keychain (iOS) / EncryptedSharedPreferences (Android).
- **CLI / backend:** Store API keys in environment variables or a secrets manager.

### 18.2 CORS

Allowed origins are configured per environment. Preflight `OPTIONS` requests are handled. Credentials (`Authorization` header) require explicit origin allowlisting.

### 18.3 Security Headers

All responses include:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`
- `X-Request-ID: req_<random>` (for tracing)

### 18.4 Data Privacy

- All data encrypted at rest (AES-256-GCM)
- TLS 1.3 minimum for all connections
- PII (resume content, emails, names) is logically separated in the database
- GDPR-compliant data export (`GET /v1/users/me/export`) and deletion
- SOC 2 Type II compliance target
- Data processing regions: US (`us-east`), EU (`eu-west`), Asia-Pacific (`ap-southeast`)

---

## 19. Complete Endpoint Index

```
# Authentication
POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/refresh
POST   /v1/auth/logout
POST   /v1/auth/forgot-password
POST   /v1/auth/reset-password
POST   /v1/auth/verify-email
POST   /v1/auth/resend-verification

# Users
GET    /v1/users/me
PATCH  /v1/users/me
PUT    /v1/users/me/password
POST   /v1/users/me/avatar
DELETE /v1/users/me
GET    /v1/users/me/api-keys
POST   /v1/users/me/api-keys
DELETE /v1/users/me/api-keys/{key_id}
GET    /v1/users/me/export

# Resumes
GET    /v1/resumes
POST   /v1/resumes
GET    /v1/resumes/{resume_id}
PUT    /v1/resumes/{resume_id}
PATCH  /v1/resumes/{resume_id}
DELETE /v1/resumes/{resume_id}
POST   /v1/resumes/{resume_id}/duplicate
GET    /v1/resumes/{resume_id}/export
POST   /v1/resumes/compare

# Resume Parsing
POST   /v1/resumes/parse
POST   /v1/resumes/parse/url
POST   /v1/resumes/parse/linkedin
GET    /v1/resumes/{resume_id}/parse-status
GET    /v1/resumes/parse/supported-formats

# Job Descriptions
GET    /v1/job-descriptions
POST   /v1/job-descriptions
POST   /v1/job-descriptions/parse
GET    /v1/job-descriptions/{jd_id}
PUT    /v1/job-descriptions/{jd_id}
PATCH  /v1/job-descriptions/{jd_id}
DELETE /v1/job-descriptions/{jd_id}
GET    /v1/job-descriptions/{jd_id}/match

# Analysis
POST   /v1/resumes/{resume_id}/analyze
GET    /v1/analyses/{analysis_id}
POST   /v1/analyses/skill-gap
POST   /v1/analyses/bulk
GET    /v1/analyses/batches/{batch_id}

# Optimization
POST   /v1/resumes/{resume_id}/optimize
POST   /v1/resumes/{resume_id}/optimize/{optimization_id}/apply

# Tailoring
POST   /v1/resumes/{resume_id}/tailor

# Versions
GET    /v1/resumes/{resume_id}/versions
GET    /v1/resumes/{resume_id}/versions/{version_id}
GET    /v1/resumes/{resume_id}/versions/{version_id}/diff
POST   /v1/resumes/{resume_id}/versions/{version_id}/restore

# History
GET    /v1/resumes/{resume_id}/history
GET    /v1/history

# Templates
GET    /v1/templates
GET    /v1/templates/{template_id}
GET    /v1/templates/{template_id}/preview

# Cover Letters
GET    /v1/cover-letters
POST   /v1/cover-letters/generate
GET    /v1/cover-letters/{cl_id}
PUT    /v1/cover-letters/{cl_id}
PATCH  /v1/cover-letters/{cl_id}
DELETE /v1/cover-letters/{cl_id}
GET    /v1/cover-letters/{cl_id}/export

# Plans & Billing
GET    /v1/plans
GET    /v1/subscriptions/me
POST   /v1/subscriptions
POST   /v1/subscriptions/me/cancel
GET    /v1/payment-methods
POST   /v1/payment-methods
DELETE /v1/payment-methods/{pm_id}
GET    /v1/billing/invoices
GET    /v1/usage

# Webhooks
POST   /v1/webhooks
GET    /v1/webhooks
GET    /v1/webhooks/{webhook_id}
PATCH  /v1/webhooks/{webhook_id}
DELETE /v1/webhooks/{webhook_id}
GET    /v1/webhooks/{webhook_id}/deliveries
POST   /v1/webhooks/{webhook_id}/deliveries/{delivery_id}/retry

# Health
GET    /v1/health
GET    /v1/health/detailed
GET    /v1/openapi.json

# Admin
GET    /v1/admin/stats
GET    /v1/admin/users
GET    /v1/admin/users/{user_id}
POST   /v1/admin/users/{user_id}/suspend
POST   /v1/admin/users/{user_id}/unsuspend
POST   /v1/admin/users/{user_id}/impersonate
GET    /v1/admin/config
PUT    /v1/admin/config
GET    /v1/admin/analytics/export
GET    /v1/admin/audit-logs
POST   /v1/admin/templates
PUT    /v1/admin/templates/{template_id}
DELETE /v1/admin/templates/{template_id}
GET    /v1/admin/health
```

---

## 20. Rate Limiting Design (Detailed)

### 20.1 Algorithm: Sliding Window Counters

Implemented via Redis sorted sets with millisecond-precision timestamps. Each window tracks unique request counts per `(user_id, endpoint_group)`.

### 20.2 Tiered Limits

| Tier | Auth endpoints | Read endpoints | Write endpoints | AI/analysis endpoints | Parse/upload |
|------|---------------|----------------|-----------------|----------------------|-------------|
| Free | 10/min | 60/min | 20/min | 5/min | 5/min |
| Pro | 30/min | 300/min | 100/min | 30/min | 20/min |
| Enterprise | 100/min | 1000/min | 500/min | 100/min | 100/min |

### 20.3 Concurrency Limits

Maximum concurrent AI analysis jobs per user: Free=1, Pro=3, Enterprise=10.

### 20.4 Cost-Based Rate Limiting

AI-heavy endpoints consume "credits." When credits are exhausted, endpoints return `402 Payment Required` or `403 Forbidden` with code `PLAN_LIMIT_REACHED`.

| Operation | Credits |
|-----------|---------|
| Parse resume | 1 |
| ATS analysis | 2 |
| Skill gap analysis | 2 |
| AI optimization | 3 |
| Tailor resume | 5 |
| Generate cover letter | 2 |
| Export (PDF) | 0 (free) |

---

*Specification version: 1.0.0 | Last updated: 2026-06-16 | Maintainer: ResumePilot AI Engineering*
