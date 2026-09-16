// Resolve o token da Página do Facebook (usado para Messenger e DMs do Instagram).
// Tokens de Página expiram; o token de usuário (META_ACCESS_TOKEN) permite gerar um novo na hora.
let cached = null;

export async function getPageAccessToken(pageId) {
  if (cached && cached.pageId === pageId) return cached;

  const userToken = Deno.env.get('META_ACCESS_TOKEN');
  if (userToken) {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(userToken)}`,
    );
    const data = await res.json();
    if (res.ok && Array.isArray(data.data) && data.data.length) {
      const page = data.data.find((p) => !pageId || p.id === pageId) || data.data[0];
      if (page?.access_token) {
        cached = { pageId: page.id, token: page.access_token, igUserId: page.instagram_business_account?.id || null };
        return cached;
      }
    }
    console.error('Falha ao obter token da Página via META_ACCESS_TOKEN:', JSON.stringify(data?.error || data));
  }

  const fallback = Deno.env.get('MESSENGER_PAGE_ACCESS_TOKEN') || Deno.env.get('FACEBOOK_PAGE_ACCESS_TOKEN');
  if (!fallback) return null;
  return { pageId: pageId || Deno.env.get('MESSENGER_PAGE_ID'), token: fallback, igUserId: null };
}