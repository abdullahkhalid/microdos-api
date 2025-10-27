export interface MicrodoseCalculationParams {
  gender: 'male' | 'female' | 'other';
  weight: number; // in kg
  substance: 'psilocybin' | 'lsd' | 'amanita' | 'ketamine';
  intakeForm: 'dried_mushrooms' | 'fresh_mushrooms' | 'truffles' | 'pure_extract' | 'blotter' | 'liquid' | 'capsules' | 'liquid_ketamine';
  sensitivity: number; // 0.5 to 1.5, default 1.0
  goal: 'sub_perceptual' | 'standard' | 'upper_microdose';
  experience?: 'beginner' | 'intermediate' | 'experienced';
  currentMedication?: string;
}

export interface MicrodoseCalculationResult {
  calculatedDose: number;
  doseUnit: 'mg' | 'µg';
  baseDose: number;
  weightFactor: number;
  sensitivityFactor: number;
  goalFactor: number;
  intakeFormFactor: number;
  explanation: string;
  recommendations: string[];
}

export interface MicrodoseProfile {
  id: string;
  userId: string;
  gender: string;
  weight: number;
  substance: string;
  intakeForm: string;
  sensitivity: number;
  goal: string;
  calculatedDose: number;
  doseUnit: string;
  experience?: string;
  currentMedication?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Substance-specific base doses (for 70kg person, standard sensitivity)
export const SUBSTANCE_BASE_DOSES = {
  psilocybin: {
    baseDose: 200, // mg dried mushrooms
    unit: 'mg' as const,
    description: 'Dried Psilocybin mushrooms'
  },
  lsd: {
    baseDose: 10, // µg
    unit: 'µg' as const,
    description: 'LSD'
  },
  amanita: {
    baseDose: 100, // mg dried
    unit: 'mg' as const,
    description: 'Dried Amanita muscaria'
  },
  ketamine: {
    baseDose: 10, // mg
    unit: 'mg' as const,
    description: 'Ketamine'
  }
};

// Goal factors
export const GOAL_FACTORS = {
  sub_perceptual: 0.5, // Very low, 5% of normal dose
  standard: 1.0,       // Standard microdose, 10% of normal dose
  upper_microdose: 2.0 // Upper microdose, 20% of normal dose
};

// Intake form factors
export const INTAKE_FORM_FACTORS = {
  // Psilocybin
  dried_mushrooms: 1.0,    // Reference
  fresh_mushrooms: 10.0,   // ~90% water content
  truffles: 2.0,           // ~50% potency of mushrooms
  pure_extract: 0.01,      // Pure psilocybin (1-2mg per 200mg dried)
  
  // LSD
  blotter: 1.0,            // Reference
  liquid: 1.0,             // Same potency
  
  // Amanita
  capsules: 1.0,           // Reference for dried
  
  // Ketamine
  liquid_ketamine: 1.0     // Reference
};

// Sensitivity ranges
export const SENSITIVITY_RANGES = {
  very_sensitive: 0.5,
  normal: 1.0,
  less_sensitive: 1.5
};
