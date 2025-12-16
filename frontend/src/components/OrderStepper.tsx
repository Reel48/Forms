import React from 'react';
import { FaCheck } from 'react-icons/fa';
import './OrderStepper.css';

export interface StepperStep {
  key: string;
  label: string;
  status: 'completed' | 'active' | 'pending';
}

interface OrderStepperProps {
  steps: StepperStep[];
}

export default function OrderStepper({ steps }: OrderStepperProps) {
  if (!steps || steps.length === 0) {
    return null;
  }

  return (
    <div className="order-stepper">
      <div className="order-stepper-container">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const isCompleted = step.status === 'completed';
          const isActive = step.status === 'active';

          return (
            <React.Fragment key={step.key}>
              <div className="order-stepper-step">
                <div
                  className={`order-stepper-circle ${
                    isCompleted ? 'completed' : isActive ? 'active' : 'pending'
                  }`}
                >
                  {isCompleted ? (
                    <FaCheck style={{ fontSize: '12px', color: 'white' }} />
                  ) : (
                    <span className="order-stepper-number">{index + 1}</span>
                  )}
                </div>
                <div
                  className={`order-stepper-label ${
                    isCompleted ? 'completed' : isActive ? 'active' : 'pending'
                  }`}
                >
                  {step.label}
                </div>
              </div>
              {!isLast && (
                <div
                  className={`order-stepper-connector ${
                    isCompleted ? 'completed' : 'pending'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

