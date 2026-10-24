import {
  Volume2, VolumeX, Music2, CalendarDays, Mail, Github, CloudSun, Timer, Rocket, Handshake, Braces, Puzzle,
  BadgeCheck, Wallet, Workflow, Activity, Inbox, Target, Users, Bell, Star, Zap, Briefcase, TrendingUp, Play,
  Pause, SkipForward, SkipBack, Square, Settings2, Plus, Heart, Coffee, BarChart3, X, ChevronRight, ArrowUpRight,
  GripVertical, Trash2, Check, RefreshCw, FolderOpen, Sparkles, Copy, Link2, Moon, Send,
} from 'lucide-react'

export const ICONS = {
  volume: Volume2, mute: VolumeX, music: Music2, calendar: CalendarDays, mail: Mail, github: Github, weather: CloudSun,
  focus: Timer, rocket: Rocket, handshake: Handshake, braces: Braces, puzzle: Puzzle, check: BadgeCheck, wallet: Wallet,
  pipeline: Workflow, pulse: Activity, inbox: Inbox, target: Target, users: Users, bell: Bell, star: Star, zap: Zap,
  briefcase: Briefcase, trend: TrendingUp, chart: BarChart3, heart: Heart, coffee: Coffee,
  play: Play, pause: Pause, next: SkipForward, prev: SkipBack, stop: Square, settings: Settings2, plus: Plus, x: X,
  chevron: ChevronRight, out: ArrowUpRight, grip: GripVertical, trash: Trash2, ok: Check, refresh: RefreshCw,
  folder: FolderOpen, sparkles: Sparkles, copy: Copy, link: Link2, moon: Moon, send: Send,
}

/** Icons a face can wear (the room's picker). */
export const FACE_ICONS = ['rocket', 'handshake', 'check', 'wallet', 'pipeline', 'pulse', 'inbox', 'mail', 'calendar', 'music',
  'volume', 'weather', 'focus', 'github', 'target', 'users', 'bell', 'star', 'zap', 'briefcase', 'trend', 'chart', 'heart',
  'coffee', 'braces', 'puzzle']

export function Icon({ name, size = 18, stroke = 2, ...rest }) {
  const C = ICONS[name] || Puzzle
  return <C size={size} strokeWidth={stroke} absoluteStrokeWidth {...rest} />
}
