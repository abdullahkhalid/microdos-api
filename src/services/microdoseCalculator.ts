import { 
  MicrodoseCalculationParams, 
  MicrodoseCalculationResult,
  SUBSTANCE_BASE_DOSES,
  GOAL_FACTORS,
  INTAKE_FORM_FACTORS
} from '../types/microdose';

export class MicrodoseCalculator {
  /**
   * Calculate microdose based on individual parameters
   * Formula: Microdose = D_base × (weight/70) × F_sensitivity × F_goal × F_intakeForm
   */
  static calculate(params: MicrodoseCalculationParams): MicrodoseCalculationResult {
    const { weight, substance, intakeForm, sensitivity, goal } = params;
    
    // Get base dose for substance
    const substanceData = SUBSTANCE_BASE_DOSES[substance];
    const baseDose = substanceData.baseDose;
    
    // Calculate factors
    const weightFactor = weight / 70; // Normalize to 70kg reference
    const sensitivityFactor = sensitivity;
    const goalFactor = GOAL_FACTORS[goal];
    const intakeFormFactor = INTAKE_FORM_FACTORS[intakeForm] || 1.0;
    
    // Calculate final dose
    const calculatedDose = baseDose * weightFactor * sensitivityFactor * goalFactor * intakeFormFactor;
    
    // Round to appropriate precision
    const roundedDose = substance === 'lsd' 
      ? Math.round(calculatedDose * 10) / 10 // 1 decimal for µg
      : Math.round(calculatedDose); // Whole numbers for mg
    
    // Generate explanation
    const explanation = this.generateExplanation({
      substance,
      baseDose,
      weightFactor,
      sensitivityFactor,
      goalFactor,
      intakeFormFactor,
      finalDose: roundedDose
    });
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(params, roundedDose);
    
    return {
      calculatedDose: roundedDose,
      doseUnit: substanceData.unit,
      baseDose,
      weightFactor,
      sensitivityFactor,
      goalFactor,
      intakeFormFactor,
      explanation,
      recommendations
    };
  }
  
  private static generateExplanation(factors: {
    substance: string;
    baseDose: number;
    weightFactor: number;
    sensitivityFactor: number;
    goalFactor: number;
    intakeFormFactor: number;
    finalDose: number;
  }): string {
    const { substance, baseDose, weightFactor, sensitivityFactor, goalFactor, intakeFormFactor, finalDose } = factors;
    
    let explanation = `Berechnung für ${substance}:\n\n`;
    explanation += `• Basis-Dosis (70kg, Standard): ${baseDose} ${substance === 'lsd' ? 'µg' : 'mg'}\n`;
    explanation += `• Gewichtsfaktor (${(weightFactor * 70).toFixed(1)}kg): ${weightFactor.toFixed(2)}x\n`;
    explanation += `• Empfindlichkeitsfaktor: ${sensitivityFactor.toFixed(1)}x\n`;
    explanation += `• Ziel-Faktor: ${goalFactor.toFixed(1)}x\n`;
    explanation += `• Einnahmeform-Faktor: ${intakeFormFactor.toFixed(1)}x\n\n`;
    explanation += `Ergebnis: ${finalDose} ${substance === 'lsd' ? 'µg' : 'mg'}`;
    
    return explanation;
  }
  
  private static generateRecommendations(params: MicrodoseCalculationParams, dose: number): string[] {
    const recommendations: string[] = [];
    
    // General safety recommendations
    recommendations.push("Beginnen Sie mit der Hälfte der berechneten Dosis für den ersten Test");
    recommendations.push("Warten Sie mindestens 3-4 Stunden zwischen Einnahmen");
    recommendations.push("Führen Sie ein Tagebuch über Ihre Erfahrungen");
    
    // Substance-specific recommendations
    switch (params.substance) {
      case 'psilocybin':
        recommendations.push("Nehmen Sie Psilocybin auf nüchternen Magen ein");
        recommendations.push("Vermeiden Sie Alkohol und andere Substanzen");
        break;
      case 'lsd':
        recommendations.push("LSD ist sehr potent - verwenden Sie präzise Messgeräte");
        recommendations.push("Bewahren Sie LSD kühl und dunkel auf");
        break;
      case 'amanita':
        recommendations.push("Amanita muscaria hat andere Wirkmechanismen als Psilocybin");
        recommendations.push("Seien Sie besonders vorsichtig bei der ersten Einnahme");
        break;
      case 'ketamine':
        recommendations.push("Ketamin-Mikrodosierung sollte nur unter ärztlicher Aufsicht erfolgen");
        recommendations.push("Achten Sie auf mögliche Blasenprobleme bei regelmäßiger Einnahme");
        break;
    }
    
    // Experience-based recommendations
    if (params.experience === 'beginner') {
      recommendations.push("Als Anfänger sollten Sie besonders konservativ dosieren");
      recommendations.push("Informieren Sie sich gründlich über die Substanz");
    }
    
    // Medication warnings
    if (params.currentMedication) {
      recommendations.push("Besprechen Sie die Einnahme mit Ihrem Arzt");
      recommendations.push("SSRIs können die Wirkung von Psychedelika beeinflussen");
    }
    
    return recommendations;
  }
  
  /**
   * Validate calculation parameters
   */
  static validateParams(params: MicrodoseCalculationParams): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!params.gender || !['male', 'female', 'other'].includes(params.gender)) {
      errors.push('Geschlecht ist erforderlich');
    }
    
    if (!params.weight || params.weight < 30 || params.weight > 200) {
      errors.push('Gewicht muss zwischen 30 und 200 kg liegen');
    }
    
    if (!params.substance || !['psilocybin', 'lsd', 'amanita', 'ketamine'].includes(params.substance)) {
      errors.push('Substanz ist erforderlich');
    }
    
    if (!params.intakeForm) {
      errors.push('Einnahmeform ist erforderlich');
    }
    
    if (!params.sensitivity || params.sensitivity < 0.3 || params.sensitivity > 2.0) {
      errors.push('Empfindlichkeit muss zwischen 0.3 und 2.0 liegen');
    }
    
    if (!params.goal || !['sub_perceptual', 'standard', 'upper_microdose'].includes(params.goal)) {
      errors.push('Ziel ist erforderlich');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
