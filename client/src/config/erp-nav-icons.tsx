import {
  Settings, Users, Package, ShoppingCart, TrendingUp, DollarSign,
  Building2, BarChart3, Shield, Bell, FileText, Banknote, CreditCard,
  Briefcase, Factory, Target, Landmark, Calendar, Home,
  UserCheck, Layers, ArrowLeftRight, PieChart, BookOpen,
  Wrench, Calculator, TrendingDown, FileCheck, LifeBuoy, Receipt,
  Inbox, MessageCircle,
  LucideIcon,
} from "lucide-react";
import { ReactNode } from "react";

const ICON_MAP: Record<string, LucideIcon> = {
  home: Home,
  settings: Settings,
  users: Users,
  package: Package,
  "shopping-cart": ShoppingCart,
  "trending-up": TrendingUp,
  "dollar-sign": DollarSign,
  "building-2": Building2,
  "bar-chart-3": BarChart3,
  shield: Shield,
  "file-text": FileText,
  banknote: Banknote,
  "credit-card": CreditCard,
  briefcase: Briefcase,
  factory: Factory,
  target: Target,
  landmark: Landmark,
  calendar: Calendar,
  "user-check": UserCheck,
  layers: Layers,
  "arrow-left-right": ArrowLeftRight,
  "pie-chart": PieChart,
  "book-open": BookOpen,
  wrench: Wrench,
  calculator: Calculator,
  "trending-down": TrendingDown,
  "file-check": FileCheck,
  "life-buoy": LifeBuoy,
  receipt: Receipt,
  bell: Bell,
  inbox: Inbox,
  "message-circle": MessageCircle,
};

export function navIcon(key: string, size = 15): ReactNode {
  const Icon = ICON_MAP[key] ?? FileText;
  return <Icon size={size} />;
}
