
CREATE TABLE public.shared_chats (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shared_chats TO anon;
GRANT SELECT, INSERT, DELETE ON public.shared_chats TO authenticated;
GRANT ALL ON public.shared_chats TO service_role;
ALTER TABLE public.shared_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read shared chats" ON public.shared_chats
  FOR SELECT USING (true);
CREATE POLICY "Owners can create their own share links" ON public.shared_chats
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners can delete their own share links" ON public.shared_chats
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX shared_chats_user_id_idx ON public.shared_chats(user_id);
