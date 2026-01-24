# @superfill/ui

Shared UI component library for Superfill.ai, built with shadcn/ui and Tailwind CSS v4.

## Components (51 total)

This package exports all shadcn/ui components used across the extension and desktop app:

- Accordion, Alert, Alert Dialog, Aspect Ratio, Avatar
- Badge, Breadcrumb, Button, Button Group
- Card, Carousel, Checkbox, Collapsible, Combobox, Command, Country Dropdown
- Creatable Select, Dialog, Dropdown Menu
- Empty, Field, Hover Card
- Input, Input Badge, Input Group, Input OTP, Item
- KBD, Label
- Pagination, Popover, Progress
- Radio Group, Resizable, Scroll Area, Select, Separator, Sheet, Skeleton, Slider, Slider with Input
- Sonner (toast), Spinner, Switch
- Table, Tabs, Textarea, Theme Toggle, Toggle, Toggle Group, Tooltip

## Usage

### Import individual components

```tsx
import { Button } from '@superfill/ui/button';
import { Card } from '@superfill/ui/card';
```

### Import globals.css

```tsx
import '@superfill/ui/globals.css';
```

## Peer Dependencies

- React ^19.0.0
- React DOM ^19.0.0

## Tech Stack

- shadcn/ui
- Radix UI primitives
- Tailwind CSS v4
- class-variance-authority
- tailwind-merge
