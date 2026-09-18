-- Bucket público para imagens de produtos (e futuramente logos de branding).
-- Escritas são feitas apenas pelo servidor (service role); leitura é pública.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
