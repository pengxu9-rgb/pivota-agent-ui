import type { ServiceType } from './types';

export const SVC_LABELS: Record<ServiceType, string> = {
  facial: 'Facial',
  'dermatology-clinic': 'Skin clinic',
  'skin-care': 'Skincare',
  'body-care': 'Body care',
  massage: 'Massage',
  'hair-cut': 'Hair',
  'hair-color': 'Color',
  'hair-perm': 'Perm',
  'hair-treatment': 'Hair treatment',
  'scalp-care': 'Scalp',
  lashes: 'Lashes',
  'eyebrow-tattoo': 'Brow',
  makeup: 'Makeup',
  'bridal-makeup': 'Bridal makeup',
  waxing: 'Waxing',
  nails: 'Nails',
};

export const SVC_FILTER_CHIPS: Array<{ id: 'all' | ServiceType; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'facial', label: 'Facials' },
  { id: 'dermatology-clinic', label: 'Skin clinics' },
  { id: 'skin-care', label: 'Skincare' },
  { id: 'massage', label: 'Massage' },
  { id: 'lashes', label: 'Lashes' },
  { id: 'eyebrow-tattoo', label: 'Brow' },
  { id: 'hair-cut', label: 'Hair' },
  { id: 'hair-color', label: 'Color' },
  { id: 'hair-treatment', label: 'Hair treat.' },
  { id: 'nails', label: 'Nails' },
  { id: 'makeup', label: 'Makeup' },
];
