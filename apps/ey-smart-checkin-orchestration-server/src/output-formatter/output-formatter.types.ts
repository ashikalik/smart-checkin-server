export type OutputFormat =
  | {
      type: 'template';
      template: string;
    }
  | {
      type: 'pick';
      fields: string[];
    }
  | {
      type: 'map';
      mapping: Record<string, string>;
    }
  | {
      type: 'json';
    }
  | Record<string, string>;
