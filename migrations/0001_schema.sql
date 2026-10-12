PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cms_blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Solar Insights',
  author_name TEXT NOT NULL DEFAULT 'Aisen Solar Team',
  featured_image TEXT,
  seo_title TEXT,
  seo_description TEXT,
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cms_blog_status_date ON cms_blog_posts(is_published, published_at);

CREATE TABLE IF NOT EXISTS cms_brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  logo_path TEXT
);
CREATE INDEX IF NOT EXISTS idx_cms_brands_sort ON cms_brands(sort_order, id);

CREATE TABLE IF NOT EXISTS cms_difference_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stat_value TEXT NOT NULL,
  stat_suffix TEXT NOT NULL DEFAULT '',
  stat_label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cms_difference_sort ON cms_difference_stats(sort_order, id);

CREATE TABLE IF NOT EXISTS cms_offices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office_type TEXT NOT NULL,
  office_name TEXT NOT NULL DEFAULT '',
  address_text TEXT NOT NULL,
  phone_display TEXT NOT NULL DEFAULT '',
  phone_href TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cms_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL DEFAULT 'Industrial',
  title TEXT NOT NULL,
  meta TEXT NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  project_type TEXT NOT NULL DEFAULT '',
  css_class TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_cms_projects_sort ON cms_projects(sort_order, id);

CREATE TABLE IF NOT EXISTS cms_project_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  image_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES cms_projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cms_project_images ON cms_project_images(project_id, sort_order, id);

CREATE TABLE IF NOT EXISTS cms_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cms_testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  quote_text TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_role TEXT NOT NULL DEFAULT '',
  initials TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  person_name TEXT NOT NULL DEFAULT '',
  person_role TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_cms_testimonials_sort ON cms_testimonials(sort_order, id);

CREATE TABLE IF NOT EXISTS enquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  city TEXT NOT NULL,
  requirement TEXT NOT NULL,
  monthly_bill TEXT,
  message TEXT,
  source_page TEXT NOT NULL DEFAULT 'Website',
  email_sent INTEGER NOT NULL DEFAULT 0 CHECK (email_sent IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_enquiries_created_at ON enquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_enquiries_requirement ON enquiries(requirement);
CREATE INDEX IF NOT EXISTS idx_enquiries_phone ON enquiries(phone);
CREATE INDEX IF NOT EXISTS idx_enquiries_email ON enquiries(email);
