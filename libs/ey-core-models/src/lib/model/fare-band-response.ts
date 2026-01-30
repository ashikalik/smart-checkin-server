export interface FareRuleResponse {
  performance?: string;
  result: FareResult;
}

export interface FareResult {
  business?: CabinClass;
  economy?: CabinClass;
  first?: CabinClass;
}

export interface CabinClass {
  comfort?: FareType;
  deluxe?: FareType;
  value?: FareType;
}

export interface FareType {
  cancel: FareRule[];
  change: FareRule[];
}

export interface FareRule {
  interval: string;
  price: Price | number | null;
}

export interface Price {
  currency: string;
  value: number;
}
