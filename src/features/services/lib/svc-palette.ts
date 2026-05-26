import type { ServiceType } from './types';

export const SVC_PALETTE: Record<ServiceType, [string, string, string]> = {
  facial: ['#F5E1D4', '#E8C8B6', '#6B3A1F'],
  'dermatology-clinic': ['#E0E8EE', '#C6D4DE', '#2A4258'],
  'skin-care': ['#F0E4D5', '#E0CFB8', '#5A3F22'],
  'body-care': ['#DCD5C5', '#C0B6A0', '#3A2F1E'],
  massage: ['#E8DED1', '#D4C5B0', '#4A3422'],
  'hair-cut': ['#E0DCD0', '#C8C2B0', '#332E20'],
  'hair-color': ['#E5C8B8', '#D6A893', '#5C2F1E'],
  'hair-perm': ['#E2DCCE', '#C7BCA0', '#3F3220'],
  'hair-treatment': ['#DDD5C5', '#C5B998', '#3D2E14'],
  'scalp-care': ['#E1E7DD', '#B7C4A8', '#4A6234'],
  lashes: ['#E5D9E5', '#D4C2D4', '#3F2A3F'],
  'eyebrow-tattoo': ['#DBD4C7', '#C0B8A8', '#3E342A'],
  makeup: ['#EAD7CB', '#D9BBA8', '#4D2A1A'],
  'bridal-makeup': ['#F0DBDE', '#DFAFB5', '#8C4751'],
  waxing: ['#EAE0D6', '#D2BFA8', '#5A4129'],
  nails: ['#F0DEDC', '#E2C2BF', '#5E2A26'],
};
