import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';
import { MicrodoseCalculator } from '../../services/microdoseCalculator';
import { MicrodoseCalculationParams } from '../../types/microdose';
import bcrypt from 'bcryptjs';

const router = Router();
const prisma = new PrismaClient();

// Validation schema for microdose calculation
const microdoseCalculationSchema = z.object({
  gender: z.enum(['male', 'female', 'other']),
  weight: z.number().min(30).max(200),
  substance: z.enum(['psilocybin', 'lsd', 'amanita', 'ketamine']),
  intakeForm: z.string().min(1),
  sensitivity: z.number().min(0.3).max(2.0).default(1.0),
  goal: z.enum(['sub_perceptual', 'standard', 'upper_microdose']),
  experience: z.enum(['beginner', 'intermediate', 'experienced']).optional().or(z.literal('')),
  currentMedication: z.string().optional().or(z.literal('')),
});

// POST /api/microdose/calculate-temporary
router.post('/calculate-temporary', async (req, res, next) => {
  try {
    const rawParams = microdoseCalculationSchema.parse(req.body);
    
    // Convert empty strings to undefined for optional fields
    const params = {
      ...rawParams,
      experience: rawParams.experience === '' ? undefined : rawParams.experience,
      currentMedication: rawParams.currentMedication === '' ? undefined : rawParams.currentMedication,
    };
    
    const sessionId = req.sessionID || req.headers['x-session-id'] as string;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }
    
    // Validate parameters
    const validation = MicrodoseCalculator.validateParams(params);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
      });
    }
    
    // Calculate microdose
    const result = MicrodoseCalculator.calculate(params);
    
    // Save temporary calculation
    const tempCalculation = await prisma.temporaryCalculation.upsert({
      where: { sessionId },
      update: {
        gender: params.gender,
        weight: params.weight,
        substance: params.substance,
        intakeForm: params.intakeForm,
        sensitivity: params.sensitivity,
        goal: params.goal,
        calculatedDose: result.calculatedDose,
        doseUnit: result.doseUnit,
        experience: params.experience,
        currentMedication: params.currentMedication,
      },
      create: {
        sessionId,
        gender: params.gender,
        weight: params.weight,
        substance: params.substance,
        intakeForm: params.intakeForm,
        sensitivity: params.sensitivity,
        goal: params.goal,
        calculatedDose: result.calculatedDose,
        doseUnit: result.doseUnit,
        experience: params.experience,
        currentMedication: params.currentMedication,
      },
    });
    
    res.json({
      success: true,
      result,
      tempCalculationId: tempCalculation.id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }
    next(error);
  }
});

// POST /api/microdose/register-with-calculation
router.post('/register-with-calculation', async (req, res, next) => {
  try {
    const registrationSchema = z.object({
      email: z.string().email(),
      name: z.string().min(2),
      password: z.string().min(6),
      tempCalculationId: z.string(),
    });
    
    const { email, name, password, tempCalculationId } = registrationSchema.parse(req.body);
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Get temporary calculation
    const tempCalculation = await prisma.temporaryCalculation.findUnique({
      where: { id: tempCalculationId },
    });
    
    if (!tempCalculation) {
      return res.status(404).json({ error: 'Calculation not found' });
    }
    
    if (tempCalculation.isRegistered) {
      return res.status(400).json({ error: 'Calculation already registered' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
      },
    });
    
    // Create microdose profile
    const profile = await prisma.microdoseProfile.create({
      data: {
        userId: user.id,
        gender: tempCalculation.gender,
        weight: tempCalculation.weight,
        substance: tempCalculation.substance,
        intakeForm: tempCalculation.intakeForm,
        sensitivity: tempCalculation.sensitivity,
        goal: tempCalculation.goal,
        calculatedDose: tempCalculation.calculatedDose,
        doseUnit: tempCalculation.doseUnit,
        experience: tempCalculation.experience,
        currentMedication: tempCalculation.currentMedication,
      },
    });

    // Create activities
    await prisma.userActivity.createMany({
      data: [
        {
          userId: user.id,
          type: 'account_created',
          title: 'Account created',
          description: 'Welcome to Microdos.in!',
        },
        {
          userId: user.id,
          type: 'microdose_calculated',
          title: 'Personalized microdose calculated',
          description: `Your microdose profile has been created with ${tempCalculation.calculatedDose} ${tempCalculation.doseUnit} ${tempCalculation.substance}`,
          metadata: {
            substance: tempCalculation.substance,
            calculatedDose: tempCalculation.calculatedDose,
            doseUnit: tempCalculation.doseUnit,
            intakeForm: tempCalculation.intakeForm,
          },
        },
      ],
    });
    
    // Update temporary calculation
    await prisma.temporaryCalculation.update({
      where: { id: tempCalculationId },
      data: {
        isRegistered: true,
        userId: user.id,
        email,
        name,
        password: hashedPassword,
      },
    });
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      profile,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }
    next(error);
  }
});

// GET /api/microdose/temp-calculation/:id
router.get('/temp-calculation/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const tempCalculation = await prisma.temporaryCalculation.findUnique({
      where: { id },
    });
    
    if (!tempCalculation) {
      return res.status(404).json({ error: 'Calculation not found' });
    }
    
    res.json({
      success: true,
      calculation: tempCalculation,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/microdose/save-profile
router.post('/save-profile', requireAuth, async (req, res, next) => {
  try {
    const params = microdoseCalculationSchema.parse(req.body);
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Validate parameters
    const validation = MicrodoseCalculator.validateParams(params);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
      });
    }
    
    // Calculate microdose
    const result = MicrodoseCalculator.calculate(params);
    
    // Save or update profile
    const profile = await prisma.microdoseProfile.upsert({
      where: { userId },
      update: {
        gender: params.gender,
        weight: params.weight,
        substance: params.substance,
        intakeForm: params.intakeForm,
        sensitivity: params.sensitivity,
        goal: params.goal,
        calculatedDose: result.calculatedDose,
        doseUnit: result.doseUnit,
        experience: params.experience,
        currentMedication: params.currentMedication,
      },
      create: {
        userId,
        gender: params.gender,
        weight: params.weight,
        substance: params.substance,
        intakeForm: params.intakeForm,
        sensitivity: params.sensitivity,
        goal: params.goal,
        calculatedDose: result.calculatedDose,
        doseUnit: result.doseUnit,
        experience: params.experience,
        currentMedication: params.currentMedication,
      },
    });
    
    res.json({
      success: true,
      profile,
      calculation: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }
    next(error);
  }
});

// GET /api/microdose/profile
router.get('/profile', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const profile = await prisma.microdoseProfile.findUnique({
      where: { userId },
    });
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/microdose/activities
router.get('/activities', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const activities = await prisma.userActivity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10, // Limit to 10 most recent activities
    });
    
    res.json({
      success: true,
      activities,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/microdose/substances
router.get('/substances', (req, res) => {
  const substances = [
    {
      id: 'psilocybin',
      name: 'Psilocybin (Magic Mushrooms)',
      description: 'Psilocybinhaltige Pilze',
      intakeForms: [
        { id: 'dried_mushrooms', name: 'Getrocknete Pilze' },
        { id: 'fresh_mushrooms', name: 'Frische Pilze' },
        { id: 'truffles', name: 'Trüffel' },
        { id: 'pure_extract', name: 'Reines Extrakt' },
      ],
    },
    {
      id: 'lsd',
      name: 'LSD',
      description: 'Lysergsäurediethylamid',
      intakeForms: [
        { id: 'blotter', name: 'Filztabletten' },
        { id: 'liquid', name: 'Flüssig' },
      ],
    },
    {
      id: 'amanita',
      name: 'Amanita muscaria',
      description: 'Fliegenpilz',
      intakeForms: [
        { id: 'capsules', name: 'Kapseln' },
      ],
    },
    {
      id: 'ketamine',
      name: 'Ketamin',
      description: 'Dissoziatives Anästhetikum',
      intakeForms: [
        { id: 'liquid', name: 'Flüssig' },
      ],
    },
  ];
  
  res.json({
    success: true,
    substances,
  });
});

export { router as microdoseRouter };
