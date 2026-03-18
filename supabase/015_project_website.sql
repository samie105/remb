-- Add website_url to projects for favicon/metadata display (like Vercel)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS website_url text;
