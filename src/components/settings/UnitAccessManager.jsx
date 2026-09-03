import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Shield, Store, UserPlus } from 'lucide-react';
import useUnitAccess from '@/components/units/useUnitAccess';

export default function UnitAccessManager() {
  const { isAdmin, units, loading: loadingUnits } = useUnitAccess();
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    email: '',
    role: 'user',
    primary_unit_id: ''
  });

  const loadUsers = async () => {
    if (!isAdmin) {
      setLoadingUsers(false);
      return;
    }

    setLoadingUsers(true);
    try {
      const list = await base44.entities.User.list();
      setUsers(list);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (!form.primary_unit_id && units.length > 0) {
      setForm((current) => ({ ...current, primary_unit_id: units[0].id }));
    }
  }, [units, form.primary_unit_id]);

  useEffect(() => {
    loadUsers();
  }, [isAdmin]);

  const handleInvite = async () => {
    if (!form.email) return;
    if (form.role !== 'admin' && !form.primary_unit_id) return;

    setInviting(true);
    setMessage('');

    try {
      await base44.users.inviteUser(form.email, form.role);

      const refreshedUsers = await base44.entities.User.list();
      const invitedUser = refreshedUsers.find(
        (user) => user.email?.toLowerCase() === form.email.toLowerCase()
      );

      if (invitedUser && form.role !== 'admin') {
        await base44.entities.User.update(invitedUser.id, {
          primary_unit_id: form.primary_unit_id
        });
      } else if (invitedUser && form.role === 'admin') {
        await base44.entities.User.update(invitedUser.id, {
          primary_unit_id: ''
        });
      }

      setUsers(await base44.entities.User.list());
      setForm({
        email: '',
        role: 'user',
        primary_unit_id: units[0]?.id || ''
      });
      setMessage('Convite enviado com a unidade vinculada.');
    } catch (error) {
      console.error('Erro ao convidar usuário:', error);
      setMessage('Não foi possível enviar o convite agora.');
    } finally {
      setInviting(false);
    }
  };

  const getUserPrimaryUnitId = (user) => user.primary_unit_id || user.data?.primary_unit_id || '';

  const handleUnitChange = async (userId, primaryUnitId) => {
    try {
      await base44.entities.User.update(userId, { primary_unit_id: primaryUnitId });
      setUsers((current) =>
        current.map((user) =>
          user.id === userId
            ? {
                ...user,
                primary_unit_id: primaryUnitId,
                data: {
                  ...(user.data || {}),
                  primary_unit_id: primaryUnitId
                }
              }
            : user
        )
      );
    } catch (error) {
      console.error('Erro ao atualizar unidade do usuário:', error);
    }
  };

  if (loadingUnits || loadingUsers) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando acessos...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="border-white/10 bg-white/5 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#FF6600]" /> Acesso restrito
          </CardTitle>
          <CardDescription className="text-gray-400">
            Somente administradores podem convidar usuários e definir as unidades.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/5 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[#FF6600]" /> Convidar login por unidade
          </CardTitle>
          <CardDescription className="text-gray-400">
            Crie os acessos de cada loja e vincule o usuário à unidade correta.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Email do usuário</Label>
            <Input
              value={form.email}
              onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
              placeholder="usuario@loja.com"
              className="border-white/10 bg-white/5"
            />
          </div>

          <div className="space-y-2">
            <Label>Perfil</Label>
            <Select
              value={form.role}
              onValueChange={(value) => setForm((current) => ({ ...current, role: value }))}
            >
              <SelectTrigger className="border-white/10 bg-white/5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Usuário da unidade</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="entregador">Entregador (apenas coletas)</SelectItem>
                <SelectItem value="coletas">Coletas (apenas coletas)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Unidade principal</Label>
            <Select
              value={form.primary_unit_id}
              onValueChange={(value) => setForm((current) => ({ ...current, primary_unit_id: value }))}
              disabled={form.role === 'admin'}
            >
              <SelectTrigger className="border-white/10 bg-white/5">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {units.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-4 flex items-center justify-between gap-3">
            <p className="text-sm text-gray-400">{message || 'Admins enxergam todas as unidades; usuários comuns ficam presos à sua loja.'}</p>
            <Button onClick={handleInvite} disabled={inviting} className="bg-[#FF6600] hover:bg-[#ff7b24]">
              {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Enviar convite
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-[#4C12A1]" /> Usuários e unidades
          </CardTitle>
          <CardDescription className="text-gray-400">
            Ajuste a unidade principal de cada login já cadastrado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {users.map((user) => (
            <div key={user.id} className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 md:grid-cols-[1.8fr_0.8fr_1.2fr] md:items-center">
              <div>
                <div className="font-medium text-white">{user.full_name || user.email}</div>
                <div className="text-sm text-gray-400">{user.email}</div>
              </div>

              <div>
                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${user.role === 'admin' ? 'bg-[#FF6600]/20 text-[#FF6600]' : (user.role === 'entregador' || user.role === 'coletas') ? 'bg-[#4C12A1]/20 text-[#4C12A1]' : 'bg-white/10 text-gray-300'}`}>
                  {user.role === 'admin' ? 'Administrador' : user.role === 'entregador' ? 'Entregador' : user.role === 'coletas' ? 'Coletas' : 'Usuário'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                  <Select
                    value={getUserPrimaryUnitId(user) || 'all'}
                    onValueChange={(value) => handleUnitChange(user.id, value === 'all' ? '' : value)}
                  >
                    <SelectTrigger className="border-white/10 bg-white/5">
                      <SelectValue placeholder="Selecionar unidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {user.role === 'admin' && (
                        <SelectItem value="all">Visão Geral (Todas)</SelectItem>
                      )}
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
              </div>
            </div>
          ))}

          {users.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-gray-500">
              Nenhum usuário encontrado ainda.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}