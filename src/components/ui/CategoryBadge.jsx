import { 
  Home, Utensils, Car, Smartphone, PartyPopper, 
  HeartPulse, PiggyBank, TrendingUp, ShoppingBag, Beer, 
  MoreHorizontal 
} from 'lucide-react';

const ICONS = {
  housing: Home,
  food: Utensils,
  transport: Car,
  telecom: Smartphone,
  leisure: PartyPopper,
  health: HeartPulse,
  savings: PiggyBank,
  investment: TrendingUp,
  shopping: ShoppingBag,
  drinks: Beer,
  other: MoreHorizontal,
};

export function CategoryBadge({ categoryId, color, size = 'md' }) {
  const Icon = ICONS[categoryId] || MoreHorizontal;
  
  const sizes = {
    sm: { wrapper: 'h-8 w-8 rounded-lg', icon: 16 },
    md: { wrapper: 'h-10 w-10 rounded-xl', icon: 20 },
    lg: { wrapper: 'h-12 w-12 rounded-2xl', icon: 24 },
  };
  
  const s = sizes[size] || sizes.md;

  return (
    <div 
      className={`flex shrink-0 items-center justify-center ${s.wrapper}`}
      style={{ backgroundColor: `${color}15`, color: color }} // 15 = opacité très légère
    >
      <Icon size={s.icon} strokeWidth={2.5} />
    </div>
  );
                                   }
