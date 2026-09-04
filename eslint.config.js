import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [
            '@/app/**',
            '@/features/**',
            '@/infrastructure/**',
            '../../app/**',
            '../../features/**',
            '../../infrastructure/**',
          ],
          message: 'Shared code cannot depend on app, features, or infrastructure.',
        }],
      }],
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}', 'src/features/**/model/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [
            '@/services/**',
            '@/infrastructure/**',
            '@/components/**',
            '../services/**',
            '../components/**',
            '../../services/**',
            '../../components/**',
          ],
          message: 'Business models cannot depend on UI or infrastructure adapters.',
        }],
      }],
    },
  },
])
