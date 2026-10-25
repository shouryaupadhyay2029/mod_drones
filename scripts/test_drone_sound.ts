// Test drone sound architecture in node/browser verification
console.log('Testing drone sound acoustic synthesis parameters:');

const BASE_RPM = 6300;
const MOTOR_FUNDAMENTAL = BASE_RPM / 60; // 105 Hz
const BPF = MOTOR_FUNDAMENTAL * 2; // 210 Hz

console.log({
  baseRpm: BASE_RPM,
  motorFundamental: MOTOR_FUNDAMENTAL,
  bladePassFreq: BPF,
  harmonics: [BPF, BPF * 2, BPF * 3, BPF * 4],
});
