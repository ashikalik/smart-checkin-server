import { Injectable } from '@nestjs/common';
import { OutputFormat } from './output-formatter.types';

@Injectable()
export class OutputFormatterService {
  format(data: unknown, format: OutputFormat): unknown {
    if (!format || typeof format !== 'object') {
      return data;
    }

    if (isTemplateFormat(format)) {
      return this.applyTemplate(format.template, data);
    }

    if (isPickFormat(format)) {
      return format.fields.reduce<Record<string, unknown>>((acc, field) => {
        acc[field] = this.getByPath(data, field);
        return acc;
      }, {});
    }

    if (isMapFormat(format)) {
      return Object.entries(format.mapping).reduce<Record<string, unknown>>((acc, [key, path]) => {
        acc[key] = this.getByPath(data, path);
        return acc;
      }, {});
    }

    if (isJsonFormat(format)) {
      const value = format.field ? this.getByPath(data, format.field) : data;
      if (typeof value !== 'string') {
        return value;
      }
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }

    return Object.entries(format).reduce<Record<string, unknown>>((acc, [key, path]) => {
      acc[key] = this.getByPath(data, path);
      return acc;
    }, {});
  }

  private applyTemplate(template: string, data: unknown): string {
    return template.replace(/\{([^}]+)\}/g, (_match, path) => {
      const value = this.getByPath(data, String(path).trim());
      if (value === undefined || value === null) {
        return '';
      }
      return String(value);
    });
  }

  private getByPath(data: unknown, path: string): unknown {
    if (!path) {
      return undefined;
    }
    const parts = path.split('.').filter(Boolean);
    let current: unknown = data;
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (Array.isArray(current) && isArrayIndex(part)) {
        current = current[Number(part)];
        continue;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}

const isTemplateFormat = (format: OutputFormat): format is { type: 'template'; template: string } =>
  (format as { type?: string }).type === 'template' && typeof (format as { template?: string }).template === 'string';

const isPickFormat = (format: OutputFormat): format is { type: 'pick'; fields: string[] } =>
  (format as { type?: string }).type === 'pick' && Array.isArray((format as { fields?: string[] }).fields);

const isMapFormat = (format: OutputFormat): format is { type: 'map'; mapping: Record<string, string> } =>
  (format as { type?: string }).type === 'map' && typeof (format as { mapping?: Record<string, string> }).mapping === 'object';

const isJsonFormat = (format: OutputFormat): format is { type: 'json'; field?: string } =>
  (format as { type?: string }).type === 'json';

const isArrayIndex = (value: string): boolean => /^\d+$/.test(value);
