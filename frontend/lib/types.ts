export type AuthTokens = {
  access: string;
  refresh: string;
};

export type User = {
  id: number;
  username: string;
  email: string;
};

export type Membership = {
  id: number;
  user: User;
  role: "editor" | "viewer";
  joined_at: string;
};

export type Page = {
  id: number;
  order: number;
  page_type: "pdf" | "blank";
  pdf_page_number: number | null;
  pdf_source_url: string;
  drawing_data: unknown;
};

export type Board = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  owner: User;
  memberships: Membership[];
};

export type BoardDetail = Board & {
  pages: Page[];
};
