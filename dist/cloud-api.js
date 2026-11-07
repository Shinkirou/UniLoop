// UniLoop 雲端資料服務。公開金鑰不授權繞過資料庫的 RLS 規則。
export const CLOUD_URL = 'https://nsfgtaqpbwstpkmhgxrp.supabase.co';
export const PUBLISHABLE_KEY = 'sb_publishable_p-m8MCZ9JbtG5RBBV087Dg_kFGz2eEi';
const IMAGE_BUCKET = 'Uniloop-product-images';
const SESSION_KEY = 'uniloop-cloud-session-v1';

export class CloudError extends Error {
  constructor(message, status) { super(message); this.name = 'CloudError'; this.status = status; }
}

export class UniLoopCloud {
  constructor({ fetcher = globalThis.fetch.bind(globalThis), storage = globalThis.localStorage } = {}) {
    this.fetcher = fetcher;
    this.storage = storage;
    this.refreshing = null;
  }

  get session() {
    try { return JSON.parse(this.storage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  saveSession(data) {
    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at || Math.floor(Date.now() / 1000) + data.expires_in,
      user: data.user
    };
    this.storage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  async request(path, { method = 'GET', body, token, prefer } = {}) {
    const headers = { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token || PUBLISHABLE_KEY}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;
    let response;
    try { response = await this.fetcher(CLOUD_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw new CloudError('無法連線至雲端服務，請檢查網路連線。', 0); }
    const raw = await response.text();
    let result = null;
    if (raw) { try { result = JSON.parse(raw); } catch { result = null; } }
    if (!response.ok) throw new CloudError(result?.msg || result?.message || result?.error_description || '雲端操作失敗，請稍後再試。', response.status);
    return result;
  }

  async signUp(email, password, redirectTo) {
    const redirect = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
    const data = await this.request('/auth/v1/signup' + redirect, { method: 'POST', body: { email, password } });
    if (data?.access_token && data?.refresh_token) this.saveSession(data);
    return data;
  }

  async requestPasswordReset(email, redirectTo) {
    return this.request('/auth/v1/recover?redirect_to=' + encodeURIComponent(redirectTo), { method:'POST', body:{email} });
  }

  async signIn(email, password) {
    const data = await this.request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    if (!data?.access_token || !data?.refresh_token) throw new CloudError('登入回應不完整。', 0);
    return this.saveSession(data);
  }

  async getSession() {
    const session = this.session;
    if (!session?.access_token || !session?.refresh_token) return null;
    if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;
    if (!this.refreshing) this.refreshing = this.request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })
      .then(data => this.saveSession(data))
      .catch(error => { if (error.status === 400 || error.status === 401) this.storage.removeItem(SESSION_KEY); throw error; })
      .finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async signOut() {
    const session = this.session;
    try { if (session?.access_token) await this.request('/auth/v1/logout', { method: 'POST', token: session.access_token }); }
    finally { this.storage.removeItem(SESSION_KEY); }
  }

  async authenticatedRequest(path, options = {}) {
    const session = await this.getSession();
    if (!session) throw new CloudError('請先登入。', 401);
    return this.request(path, { ...options, token: session.access_token });
  }

  async listProducts() { const rows = await this.request('/rest/v1/products?select=*&order=created_at.desc'); return (rows || []).filter(row => !row.deleted_at); }

  async listMyProducts() {
    const session = await this.getSession();
    if (!session?.user?.id) throw new CloudError('請先登入。', 401);
    return this.authenticatedRequest(`/rest/v1/products?owner_id=eq.${encodeURIComponent(session.user.id)}&select=*&order=created_at.desc`);
  }

  async updateProduct(id, product) {
    const session = await this.getSession();
    if (!session?.user?.id) throw new CloudError('請先登入。', 401);
    const fields = ['name','description','category','price','city','school','methods','condition','exchange_wish','accept_difference'];
    const body = Object.fromEntries(fields.filter(key => product[key] !== undefined).map(key => [key, product[key]]));
    return this.authenticatedRequest(`/rest/v1/products?id=eq.${encodeURIComponent(id)}&owner_id=eq.${encodeURIComponent(session.user.id)}`, {
      method: 'PATCH', prefer: 'return=representation', body
    });
  }

  async listFavorites() {
    const session = await this.getSession();
    if (!session?.user?.id) return [];
    return this.authenticatedRequest(`/rest/v1/favorites?user_id=eq.${encodeURIComponent(session.user.id)}&select=product_id`);
  }

  async addFavorite(productId) {
    const session = await this.getSession();
    if (!session?.user?.id) throw new CloudError('請先登入。', 401);
    return this.authenticatedRequest('/rest/v1/favorites?on_conflict=user_id,product_id', {
      method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
      body: { user_id: session.user.id, product_id: productId }
    });
  }

  async removeFavorite(productId) {
    const session = await this.getSession();
    if (!session?.user?.id) throw new CloudError('請先登入。', 401);
    return this.authenticatedRequest(`/rest/v1/favorites?user_id=eq.${encodeURIComponent(session.user.id)}&product_id=eq.${encodeURIComponent(productId)}`, {
      method: 'DELETE', prefer: 'return=minimal'
    });
  }

  async getOrCreateConversation(productId, sellerId) {
    const session = await this.getSession();
    if (!session?.user?.id) throw new CloudError('請先登入。', 401);
    const buyer = session.user.id;
    if (buyer === sellerId) throw new CloudError('不能與自己開啟對話。', 400);
    const query = `/rest/v1/conversations?product_id=eq.${encodeURIComponent(productId)}&buyer_id=eq.${encodeURIComponent(buyer)}&seller_id=eq.${encodeURIComponent(sellerId)}&select=*`;
    let rows = await this.authenticatedRequest(query);
    if (rows?.length) return rows[0];
    await this.authenticatedRequest('/rest/v1/conversations?on_conflict=product_id,buyer_id,seller_id', {
      method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { product_id: productId, buyer_id: buyer, seller_id: sellerId }
    });
    rows = await this.authenticatedRequest(query);
    if (!rows?.length) throw new CloudError('無法建立聊天室，請重新整理後再試。', 0);
    return rows[0];
  }

  listQuestions(productId) { return this.request('/rest/v1/product_questions?product_id=eq.'+encodeURIComponent(productId)+'&select=id,author_id,body,answer,created_at,answered_at&order=created_at.asc'); }
  createQuestion(productId, body) { return this.authenticatedRequest('/rest/v1/rpc/create_product_question', {method:'POST',body:{p_product_id:productId,p_body:body}}); }
  answerQuestion(id, answer) { return this.authenticatedRequest('/rest/v1/rpc/answer_product_question', {method:'POST',body:{p_question_id:id,p_answer:answer}}); }
  questionChat(id) { return this.authenticatedRequest('/rest/v1/rpc/question_start_chat', {method:'POST',body:{p_question_id:id}}); }
  listQuestionNotifications() { return this.authenticatedRequest('/rest/v1/question_notifications?select=id,question_id,kind,created_at,read_at,product_questions(product_id,products(name))&read_at=is.null&order=created_at.desc'); }
  markQuestionNoticeRead(id) { return this.authenticatedRequest('/rest/v1/question_notifications?id=eq.'+encodeURIComponent(id), {method:'PATCH',body:{read_at:new Date().toISOString()}}); }

  listConversations() { return this.authenticatedRequest('/rest/v1/conversations?select=*,products(name)&order=created_at.desc'); }
  async getConversation(id) {
    const rows = await this.authenticatedRequest(`/rest/v1/conversations?id=eq.${encodeURIComponent(id)}&select=*,products(name,methods,status)`);
    return rows?.[0] || null;
  }
  listMessages(id) { return this.authenticatedRequest(`/rest/v1/messages?conversation_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.asc`); }
  listRecentMessages() { return this.authenticatedRequest('/rest/v1/messages?select=id,conversation_id,sender_id,created_at&order=created_at.desc&limit=500'); }
  listConversationReads() { return this.authenticatedRequest('/rest/v1/conversation_reads?select=conversation_id,last_read_at'); }
  async markConversationRead(id, lastReadAt) {
    const session = await this.getSession();
    if (!session?.user?.id) throw new CloudError('請先登入。', 401);
    return this.authenticatedRequest('/rest/v1/conversation_reads?on_conflict=conversation_id,user_id', {
      method:'POST', prefer:'resolution=merge-duplicates,return=minimal', body:{ conversation_id:id, user_id:session.user.id, last_read_at:lastReadAt }
    });
  }
  async sendMessage(id, text) {
    const session = await this.getSession();
    if (!session?.user?.id) throw new CloudError('請先登入。', 401);
    return this.authenticatedRequest('/rest/v1/messages', { method:'POST', prefer:'return=representation', body:{ conversation_id:id, sender_id:session.user.id, body:text } });
  }
  listTrades() { return this.authenticatedRequest('/rest/v1/trade_requests?select=*,products(name)&order=created_at.desc'); }
  async serverTradeNoticesEnabled() { try { return (await this.authenticatedRequest('/rest/v1/rpc/server_trade_notices_enabled', {method:'POST',body:{}})) === true; } catch { return false; } }
  createTrade(productId, method) { return this.authenticatedRequest('/rest/v1/rpc/create_trade_request', { method:'POST', body:{ p_product_id:productId, p_method:method } }); }
  transitionTrade(id, status, reason = null) { return this.authenticatedRequest('/rest/v1/rpc/transition_trade_request', { method:'POST', body:{ p_id:id, p_status:status, p_reason:reason } }); }

  async getProfile() {
    const session = await this.getSession();
    if (!session?.user?.id) return null;
    const rows = await this.authenticatedRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=*`);
    return rows?.[0] || null;
  }

  async getPublicProfile(id) {
    const rows = await this.request(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=display_name,school,city,avatar_url`);
    return rows?.[0] || null;
  }

  async deleteProduct() { throw new CloudError('舊刪除方式已停用，請使用商品管理。', 400); }
  async updateProductImages(id, urls) { return this.authenticatedRequest('/rest/v1/rpc/update_product_images', {method:'POST',body:{p_id:id,p_urls:urls}}); }
  async setProductListingStatus(id, status) { return this.authenticatedRequest('/rest/v1/rpc/set_product_listing_status', { method:'POST', body:{ p_id:id, p_status:status } }); }
  async archiveProduct(id) { return this.authenticatedRequest('/rest/v1/rpc/archive_product', { method:'POST', body:{ p_id:id } }); }
  async listImageCleanup() { return this.authenticatedRequest('/rest/v1/product_image_cleanup?select=product_id,paths&order=created_at.asc'); }
  async finishImageCleanup(id) { return this.authenticatedRequest('/rest/v1/rpc/finish_product_image_cleanup', { method:'POST', body:{ p_id:id } }); }
  async cleanupProductImages(entry) {
    if (entry.paths?.length) await this.removeProductImages(entry.paths);
    await this.finishImageCleanup(entry.product_id);
  }

  async updateProductName(id, name) {
    return this.authenticatedRequest(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', prefer: 'return=representation', body: { name }
    });
  }

  async uploadProductImage(file) {
    const session = await this.getSession();
    if (!session?.user?.id) throw new CloudError('請先登入。', 401);
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    if (!extensions[file.type] || file.size > 1024 * 1024 || !file.size) throw new CloudError('圖片須為 JPG、PNG 或 WebP，且每張不超過 1 MB。', 400);
    const objectPath = `${session.user.id}/${crypto.randomUUID()}.${extensions[file.type]}`;
    const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
    let response;
    try {
      response = await this.fetcher(`${CLOUD_URL}/storage/v1/object/${IMAGE_BUCKET}/${encodedPath}`, {
        method: 'POST', headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}`, 'Content-Type': file.type, 'x-upsert': 'false' }, body: file
      });
    } catch { throw new CloudError('圖片上傳失敗，請檢查網路連線。', 0); }
    if (!response.ok) {
      let error; try { error = await response.json(); } catch { error = {}; }
      throw new CloudError(error.message || error.error || '圖片上傳失敗，請確認儲存空間與權限設定。', response.status);
    }
    return { path: objectPath, url: `${CLOUD_URL}/storage/v1/object/public/${IMAGE_BUCKET}/${encodedPath}` };
  }

  async removeProductImages(paths) {
    if (!paths.length) return;
    return this.authenticatedRequest(`/storage/v1/object/${IMAGE_BUCKET}`, { method: 'DELETE', body: { prefixes: paths } });
  }

  async saveProfile({ display_name, school = '', city = '', avatar_url = null }) {
    const session = await this.getSession();
    if (!session?.user?.id) throw new CloudError('請先登入。', 401);
    return this.authenticatedRequest('/rest/v1/profiles?on_conflict=id', {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=representation',
      body: { id: session.user.id, display_name, school, city, avatar_url }
    });
  }

  async createProduct(product) {
    const session = await this.getSession();
    if (!session?.user?.id) throw new CloudError('請先登入。', 401);
    const fields = ['name', 'description', 'category', 'price', 'city', 'school', 'methods', 'condition', 'exchange_wish', 'accept_difference', 'image_urls'];
    const body = Object.fromEntries(fields.filter(key => product[key] !== undefined).map(key => [key, product[key]]));
    body.owner_id = session.user.id;
    return this.authenticatedRequest('/rest/v1/products', { method: 'POST', prefer: 'return=representation', body });
  }

  async findImportedProduct(sourceKey) {
    const session = await this.getSession();
    if (!session?.user?.id) throw new CloudError('請先登入。', 401);
    const path = `/rest/v1/products?owner_id=eq.${encodeURIComponent(session.user.id)}&legacy_source_key=eq.${encodeURIComponent(sourceKey)}&select=id,legacy_source_key`;
    const rows = await this.authenticatedRequest(path);
    return rows?.[0] || null;
  }

  async importLegacyProduct(product, sourceKey) {
    const session = await this.getSession();
    if (!session?.user?.id) throw new CloudError('請先登入。', 401);
    const fields = ['name', 'description', 'category', 'price', 'city', 'school', 'methods', 'condition', 'exchange_wish', 'accept_difference', 'image_urls', 'status', 'created_at'];
    const body = Object.fromEntries(fields.filter(key => product[key] !== undefined).map(key => [key, product[key]]));
    body.owner_id = session.user.id;
    body.legacy_source_key = sourceKey;
    return this.authenticatedRequest('/rest/v1/products?on_conflict=owner_id,legacy_source_key', {
      method: 'POST', prefer: 'resolution=ignore-duplicates,return=representation', body
    });
  }
}
