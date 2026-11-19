import base from './playwright.config';
import { defineConfig } from '@playwright/test';

export default defineConfig({ ...base, testDir: 'tests/live', workers: 1, reporter: [['list']], projects: [base.projects![0]] });
