// Resolução ÚNICA de cliente por canal (WhatsApp LID, Instagram, Messenger).
// O id externo do contato é gravado NO PRÓPRIO cliente, então toda mensagem
// seguinte encontra exatamente o mesmo registro — sem duplicados.

const isPlaceholder = (name) => {
  const n = String(name || '').trim().toLowerCase();
  return !n || n === 'cliente' || n === 'novo cliente' ||
    n.startsWith('cliente instagram') || n.startsWith('cliente messenger') ||
    n.includes('@lid') || n.includes('@s.whatsapp.net') ||
    /^\+?\d{8,}$/.test(n.replace(/\s/g, ''));
};

// field: 'instagram_user_id' | 'messenger_user_id' | 'whatsapp_lid'
export const findCustomerByChannelId = async (base44, field, externalId) => {
  if (!externalId) return null;
  const matches = await base44.asServiceRole.entities.Customer.filter({ [field]: String(externalId) }, 'created_date', 5);
  return matches[0] || null;
};

export const findCustomerByName = async (base44, name) => {
  if (isPlaceholder(name)) return null;
  const target = String(name).trim().toLowerCase();
  const recent = await base44.asServiceRole.entities.Customer.list('-created_date', 500);
  return recent.find((c) => (c.full_name || '').trim().toLowerCase() === target) || null;
};

// Encontra (por id do canal, depois por nome) ou cria UM cliente, sempre
// gravando o id do canal no registro encontrado/criado.
export const resolveChannelCustomer = async (base44, { field, externalId, name, createData = {} }) => {
  let customer = await findCustomerByChannelId(base44, field, externalId);
  if (!customer) customer = await findCustomerByName(base44, name);

  if (customer) {
    const patch = { last_inbound_at: new Date().toISOString() };
    if (externalId && String(customer[field] || '') !== String(externalId)) patch[field] = String(externalId);
    if (name && !isPlaceholder(name) && isPlaceholder(customer.full_name)) patch.full_name = name;
    await base44.asServiceRole.entities.Customer.update(customer.id, patch);
    return { customer: { ...customer, ...patch }, created: false };
  }

  const created = await base44.asServiceRole.entities.Customer.create({
    status: 'active',
    last_inbound_at: new Date().toISOString(),
    ...createData,
    full_name: createData.full_name || name || 'Novo Cliente',
    ...(externalId ? { [field]: String(externalId) } : {}),
  });
  return { customer: created, created: true };
};

export { isPlaceholder as isPlaceholderCustomerName };