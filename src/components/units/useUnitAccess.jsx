import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';

export const PRESET_UNITS = [
  { name: 'Loja Rio Branco', subdomain: 'riobranco' },
  { name: 'Loja Petrópolis', subdomain: 'petropolis' },
  { name: 'Loja Zaffari (Protásio Alves)', subdomain: 'zaffari-protasio' },
  { name: 'Loja Bourbon Wallig', subdomain: 'bourbon-wallig' },
  { name: 'Loja Moinhos Shopping', subdomain: 'moinhos-shopping' }
];

const normalizeText = (value = '') =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const isRioBrancoUnit = (unit) => {
  const name = normalizeText(unit?.name);
  const subdomain = normalizeText(unit?.subdomain);
  return name.includes('rio branco') || subdomain === 'riobranco' || subdomain === 'rio-branco';
};

const getPrimaryUnitId = (user) => user?.primary_unit_id || user?.data?.primary_unit_id || '';

export const getRecordUnitId = (record) => record?.unit_id || record?.data?.unit_id || null;

export const filterRecordsByUnit = (records, selectedUnitId, fallbackUnitId) => {
  if (selectedUnitId === 'all') return records;

  return records.filter((record) => {
    const unitId = getRecordUnitId(record);
    if (unitId) return unitId === selectedUnitId;
    return fallbackUnitId ? selectedUnitId === fallbackUnitId : false;
  });
};

export const getUnitLabel = (selectedUnit, selectedUnitId) => {
  if (selectedUnitId === 'all') return 'Todas as unidades';
  return selectedUnit?.name || 'Unidade';
};

export default function useUnitAccess() {
  const [user, setUser] = useState(null);
  const [units, setUnits] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [loading, setLoading] = useState(true);

  const loadAccess = async (forceRefresh = false) => {
    setLoading(true);
    try {
      // Cache user for 5 minutes in sessionStorage to avoid hammering auth.me() on every page mount
      let currentUser = null;
      const cachedUserRaw = sessionStorage.getItem('cachedUser');
      if (!forceRefresh && cachedUserRaw) {
        try {
          const parsed = JSON.parse(cachedUserRaw);
          if (parsed && Date.now() - parsed.t < 5 * 60 * 1000) {
            currentUser = parsed.u;
          }
        } catch (_) { /* ignore */ }
      }
      if (!currentUser) {
        currentUser = await base44.auth.me();
        sessionStorage.setItem('cachedUser', JSON.stringify({ u: currentUser, t: Date.now() }));
      }
      setUser(currentUser);

      // Cache units list for 5 minutes — avoids 429 rate limit on get_all_units
      let unitsList = [];
      const cachedUnitsRaw = sessionStorage.getItem('cachedUnits');
      if (!forceRefresh && cachedUnitsRaw) {
        try {
          const parsed = JSON.parse(cachedUnitsRaw);
          if (parsed && Array.isArray(parsed.list) && Date.now() - parsed.t < 5 * 60 * 1000) {
            unitsList = parsed.list;
          }
        } catch (_) { /* ignore */ }
      }

      if (unitsList.length === 0) {
        try {
          unitsList = await base44.entities.Unit.list('name', 100);
        } catch (e) {
          // Network/rate-limit error — use empty list, do NOT throw
          console.warn('Failed to load units, using empty list', e);
          unitsList = [];
        }
        if (unitsList.length > 0) {
          sessionStorage.setItem('cachedUnits', JSON.stringify({ list: unitsList, t: Date.now() }));
        }
      }

      setUnits(unitsList);

      const savedPrimaryUnitId = getPrimaryUnitId(currentUser);
      const savedPrimaryUnit = unitsList.find((unit) => unit.id === savedPrimaryUnitId) || null;
      const fallbackUnit = savedPrimaryUnit || unitsList[0] || unitsList.find(isRioBrancoUnit) || null;
      const primaryUnitId = fallbackUnit?.id || '';
      const isAdmin = currentUser?.role === 'admin';

      setSelectedUnitId((currentValue) => currentValue || (isAdmin ? 'all' : primaryUnitId));
    } catch (error) {
      console.error('Erro ao carregar acesso por unidade:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccess();
  }, []);

  const defaultUnitId = useMemo(() => {
    const savedPrimaryUnitId = getPrimaryUnitId(user);
    const savedPrimaryUnit = units.find((unit) => unit.id === savedPrimaryUnitId) || null;
    const fallbackUnit = savedPrimaryUnit || units[0] || units.find(isRioBrancoUnit) || null;
    return fallbackUnit?.id || '';
  }, [units, user]);

  const isAdmin = user?.role === 'admin';
  // All users can see all units for filtering purposes
  const accessibleUnits = units;

  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) || null;

  return {
    user,
    units,
    accessibleUnits,
    isAdmin,
    selectedUnit,
    selectedUnitId,
    setSelectedUnitId,
    defaultUnitId,
    loading,
    reloadAccess: () => loadAccess(true)
  };
}