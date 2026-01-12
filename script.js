// Game constants
const GRAVITY = 0.5;// gravity
const JUMP_FORCE = -12; // jump force
const PLAYER_SIZE = 20;
const PLATFORM_WIDTH = 100;
const PLATFORM_HEIGHT = 20;
const SCROLL_SPEED = 3;
const STAR_COUNT = 200;
const COMET_SPEED_BOOST = 1.5;
const NEBULA_BOUNCE_MULTIPLIER = 1.3;
const BLACK_HOLE_REVERSE_TIME = 3000;
const TIME_WARP_DURATION = 5000; // 5 seconds
const MAGNET_DURATION = 8000; // 8 seconds

// Game variables
let canvas, ctx;
let player;
let platforms = [];
let particles = [];
let stars = [];
let hazards = [];
let score = 0;
let highScore = localStorage.getItem('cosmicHighScore') || 0;
let gameRunning = true;
let keys = {};
let powerUps = [];
let cameraY = 0;
let currentGravity = GRAVITY; // Variable to hold current gravity value
let gameSpeed = 1;
let combo = 0;
let lastPlatformType = null;
let screenShake = 0;
let screenShakeIntensity = 0;

// Platform types
const PLATFORM_TYPES = {
    NEBULA: 'nebula',      // Soft and bouncy
    METEOR: 'meteor',      // Fragile and breakable
    BLACK_HOLE: 'blackhole', // Gravity reversal
    COMET: 'comet',        // Slippery and fast
    STAR: 'star',          // Healing and glowing
    SPIKE: 'spike',        // Falling cosmic spikes
    SPIKE_TWISTED: 'spike_twisted' // Twisted falling cosmic spikes
};

// Power-up types
const POWER_UP_TYPES = {
    STARDUST: 'stardust',   // Points
    CRYSTAL: 'crystal',     // Temporary shield
    PULSAR: 'pulsar',       // Double jump
    TIME_WARP: 'time_warp', // Slow down time
    MAGNET: 'magnet',       // Attract collectibles
    NEBULA_SHIFT: 'nebula_shift' // Phase through platforms
};

// Hazard types
const HAZARD_TYPES = {
    ASTEROID_SPIKE: 'asteroid_spike',
    DARK_VOID: 'dark_void',
    UNSTABLE_PLATFORM: 'unstable_platform'
};

// Player object
class Player {
    constructor() {
        this.x = 400;
        this.y = 300;
        this.velocityX = 0;
        this.velocityY = 0;
        this.radius = PLAYER_SIZE;
        this.color = '#6a6aff';
        this.glowColor = '#a0a0ff';
        this.onGround = false;
        this.jumps = 0;
        this.maxJumps = 2;
        this.hasShield = false;
        this.shieldTime = 0;
        this.hasMagnet = false;
        this.isPhasing = false;
        this.isInvincible = false;
        this.lastPowerUpTime = 0;
        this.quickCollectCombo = 0;
        this.trail = [];
        this.phaseTime = 0;
        // New property to track if the player is currently on a platform
        this.currentPlatform = null;
        // New property to track platforms the player has landed on for scoring
        this.visitedPlatforms = new Set();
    }

    update() {
        // Apply gravity
        this.velocityY += currentGravity;
        
        // Apply horizontal movement
        if (keys['ArrowLeft'] || keys['a']) {
            this.velocityX = Math.max(this.velocityX - 0.5, -8);
        } else if (keys['ArrowRight'] || keys['d']) {
            this.velocityX = Math.min(this.velocityX + 0.5, 8);
        } else {
            this.velocityX *= 0.9; // Friction
        }
        
        // Update position
        this.x += this.velocityX;
        this.y += this.velocityY;
        
        // Keep ball within canvas boundaries with proper bouncing (no sticking)
        // Horizontal boundaries
        if (this.x < this.radius) {
            this.x = this.radius; // Position exactly at boundary
            this.velocityX = Math.abs(this.velocityX) * 0.7; // Bounce with energy retention
            createParticles(this.x, this.y, 5, '#6a6aff'); // Visual feedback
        } else if (this.x > canvas.width - this.radius) {
            this.x = canvas.width - this.radius; // Position exactly at boundary
            this.velocityX = -Math.abs(this.velocityX) * 0.7; // Bounce with energy retention
            createParticles(this.x, this.y, 5, '#6a6aff'); // Visual feedback
        }
        
        // Vertical boundaries (top and bottom)
        if (this.y < this.radius) {
            this.y = this.radius; // Position exactly at boundary
            this.velocityY = Math.abs(this.velocityY) * 0.7; // Bounce with energy retention
            createParticles(this.x, this.y, 5, '#6a6aff'); // Visual feedback
        } else if (this.y > canvas.height - this.radius) {
            this.y = canvas.height - this.radius; // Position exactly at boundary
            this.velocityY = -Math.abs(this.velocityY) * 0.7; // Bounce with energy retention
            createParticles(this.x, this.y, 5, '#6a6aff'); // Visual feedback
            // Trigger game over when hitting bottom
            setTimeout(() => {
                gameOver();
            }, 100);
        }
        
        // Update trail
        this.trail.push({x: this.x, y: this.y});
        if (this.trail.length > 15) {
            this.trail.shift();
        }
        
        // Update abilities
        if (this.hasShield) {
            this.shieldTime--;
            if (this.shieldTime <= 0) {
                this.hasShield = false;
            }
        }
        
        // Update phasing ability
        if (this.isPhasing) {
            this.phaseTime++;
            if (this.phaseTime > 180) { // 3 seconds
                this.isPhasing = false;
                this.phaseTime = 0;
            }
        }
        
        // Check platform collisions
        this.onGround = false;
        this.currentPlatform = null;
        platforms.forEach(platform => {
            // Skip collision if phasing through platforms
            if (this.isPhasing && platform.type !== PLATFORM_TYPES.BLACK_HOLE) return;
            
            if (this.collidesWith(platform)) {
                this.handlePlatformCollision(platform);
                this.currentPlatform = platform;
            }
        });
        
        // If not on a platform and not in the air from a jump, snap to nearest platform
        if (!this.onGround && this.velocityY >= 0 && !this.currentPlatform) {
            // Check if we should snap to a platform
            this.checkSnapToPlatform();
        }
        
        // Check power-up collisions
        for (let i = powerUps.length - 1; i >= 0; i--) {
            // If magnet is active, attract power-ups
            if (this.hasMagnet) {
                const dx = this.x - powerUps[i].x;
                const dy = this.y - powerUps[i].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // If power-up is within magnet range
                if (distance < 200) {
                    // Move power-up toward player
                    powerUps[i].x += dx / distance * 3;
                    powerUps[i].y += dy / distance * 3;
                }
            }
            
            if (this.collidesWithPowerUp(powerUps[i])) {
                this.collectPowerUp(powerUps[i]);
                powerUps.splice(i, 1);
                createParticles(this.x, this.y, 20, '#ffffff');
                combo++;
                if (combo % 5 === 0) {
                    score += combo * 10; // Combo bonus
                }
            }
        }
        
        // Check hazard collisions
        for (let i = hazards.length - 1; i >= 0; i--) {
            if (this.collidesWithHazard(hazards[i])) {
                this.hitHazard(hazards[i]);
            }
        }
        
        // Update score based on height - only increase when moving upward
        const newScore = Math.max(0, Math.floor(-this.y / 10));
        // Only update score if it's higher than current score (player is moving upward)
        if (newScore > score) {
            score = newScore;
            document.getElementById('score').textContent = `Score: ${score}`;
            if (score > highScore) {
                highScore = score;
                document.getElementById('highScore').textContent = `High Score: ${highScore}`;
                localStorage.setItem('cosmicHighScore', highScore);
                
                // Special effect when reaching milestones
                if (score === 500 || score === 1000 || score === 2000) {
                    // Create special particles
                    for (let i = 0; i < 100; i++) {
                        particles.push(new Particle(
                            Math.random() * canvas.width,
                            Math.random() * canvas.height,
                            '#ffff80'
                        ));
                    }
                }
                
                // Special effect for very high scores
                if (score >= 3000 && score % 1000 === 0) {
                    // Create a galaxy explosion effect
                    for (let i = 0; i < 200; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const distance = Math.random() * 300;
                        particles.push(new Particle(
                            canvas.width/2 + Math.cos(angle) * distance,
                            canvas.height/2 + Math.sin(angle) * distance,
                            `hsl(${Math.random() * 360}, 100%, 70%)`
                        ));
                    }
                    
                    // Temporary super abilities
                    this.isInvincible = true;
                    this.hasMagnet = true;
                    this.isPhasing = true;
                    setTimeout(() => {
                        this.isInvincible = false;
                        this.hasMagnet = false;
                        this.isPhasing = false;
                    }, 5000);
                }
            }
            
            // Increase difficulty based on score
            if (score > 0 && score % 100 === 0) {
                gameSpeed = Math.min(2.0, 1 + Math.floor(score / 100) * 0.1);
                document.getElementById('speed').textContent = `Speed: ${gameSpeed.toFixed(1)}x`;
                
                // Special effect when speed increases
                if (gameSpeed > 1.5) {
                    createParticles(canvas.width/2, canvas.height/2, 50, '#ff4040');
                }
            }
        }
        
        // Ensure score display is always updated (fix for potential display issues)
        document.getElementById('score').textContent = `Score: ${score}`;
        document.getElementById('highScore').textContent = `High Score: ${highScore}`;
        
        // Prevent negative scores
        if (score < 0) score = 0;
        if (highScore < 0) highScore = 0;
    }
    
    // New method to check if we should snap to a platform
    checkSnapToPlatform() {
        // Find the closest platform below the player
        let closestPlatform = null;
        let closestDistance = Infinity;
        
        platforms.forEach(platform => {
            // Check if platform is below the player
            if (platform.y > this.y) {
                // Check if player is within horizontal bounds of platform
                if (this.x >= platform.x - this.radius && this.x <= platform.x + platform.width + this.radius) {
                    const distance = platform.y - this.y;
                    if (distance < closestDistance && distance > 0) {
                        closestDistance = distance;
                        closestPlatform = platform;
                    }
                }
            }
        });
        
        // If there's a platform close enough, snap to it
        if (closestPlatform && closestDistance < 30) {
            this.y = closestPlatform.y - this.radius;
            this.velocityY = 0;
            this.onGround = true;
            this.jumps = 0;
            this.currentPlatform = closestPlatform;
        }
    }
    
    collidesWith(platform) {
        const distanceX = Math.abs(this.x - (platform.x + platform.width / 2));
        const distanceY = Math.abs(this.y - (platform.y + platform.height / 2));
        
        if (distanceX > (platform.width / 2 + this.radius)) return false;
        if (distanceY > (platform.height / 2 + this.radius)) return false;
        
        if (distanceX <= (platform.width / 2)) return true;
        if (distanceY <= (platform.height / 2)) return true;
        
        const cornerDistance = Math.pow(distanceX - platform.width / 2, 2) + 
                              Math.pow(distanceY - platform.height / 2, 2);
        return cornerDistance <= Math.pow(this.radius, 2);
    }
    
    collidesWithPowerUp(powerUp) {
        const dx = this.x - powerUp.x;
        const dy = this.y - powerUp.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < this.radius + 10;
    }
    
    collidesWithHazard(hazard) {
        if (hazard.type === HAZARD_TYPES.DARK_VOID) {
            // Circular collision for dark voids
            const dx = this.x - hazard.x;
            const dy = this.y - hazard.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance < this.radius + hazard.width/2;
        } else {
            // Rectangular collision for other hazards
            const distanceX = Math.abs(this.x - (hazard.x + hazard.width / 2));
            const distanceY = Math.abs(this.y - (hazard.y + hazard.height / 2));
            
            if (distanceX > (hazard.width / 2 + this.radius)) return false;
            if (distanceY > (hazard.height / 2 + this.radius)) return false;
            
            if (distanceX <= (hazard.width / 2)) return true;
            if (distanceY <= (hazard.height / 2)) return true;
            
            const cornerDistance = Math.pow(distanceX - hazard.width / 2, 2) + 
                                  Math.pow(distanceY - hazard.height / 2, 2);
            return cornerDistance <= Math.pow(this.radius, 2);
        }
    }
    
    hitHazard(hazard) {
        if (this.isInvincible) {
            // Just create particles but don't apply damage
            createParticles(this.x, this.y, 20, '#ffffff');
            return;
        }
        
        if (this.hasShield) {
            this.hasShield = false;
            createParticles(this.x, this.y, 30, '#80ffff');
            return;
        }
        
        // Reset combo when hit
        combo = 0;
        document.getElementById('combo').textContent = `Combo: ${combo}`;
        
        // Apply hazard effect
        switch (hazard.type) {
            case HAZARD_TYPES.ASTEROID_SPIKE:
                // Lose points and bounce
                score = Math.max(0, score - 50);
                this.velocityY = JUMP_FORCE * 0.7;
                createParticles(this.x, this.y, 25, '#ff4040');
                // Trigger game over if hit by spike
                setTimeout(() => {
                    gameOver();
                }, 100);
                break;
                
            case HAZARD_TYPES.DARK_VOID:
                // Reverse controls temporarily
                setTimeout(() => {
                    // Would implement control reversal here
                }, 2000);
                createParticles(this.x, this.y, 40, '#404080');
                break;
                
            case HAZARD_TYPES.UNSTABLE_PLATFORM:
                // Shake screen and lose combo
                createParticles(this.x, this.y, 35, '#806060');
                break;
        }
        
        // Ensure score doesn't go below 0
        if (score < 0) score = 0;
        document.getElementById('score').textContent = `Score: ${score}`;
    }
    
    handlePlatformCollision(platform) {
        // If it's a spike platform, treat it as a hazard
        if (platform.type === PLATFORM_TYPES.SPIKE || platform.type === PLATFORM_TYPES.SPIKE_TWISTED) {
            this.hitHazard({type: HAZARD_TYPES.ASTEROID_SPIKE, width: platform.width, height: platform.height, x: platform.x, y: platform.y});
            return;
        }
        
        // Different behavior based on platform type
        switch (platform.type) {
            case PLATFORM_TYPES.NEBULA:
                // Bouncy platform
                if (this.velocityY > 0 && !this.onGround) { // Prevent multiple collisions
                    this.velocityY = JUMP_FORCE * NEBULA_BOUNCE_MULTIPLIER;
                    this.onGround = true;
                    this.jumps = 0;
                    createParticles(this.x, this.y, 10, '#a040ff');
                    
                    // Add 10 points for landing on a new platform
                    if (!this.visitedPlatforms.has(platform)) {
                        this.visitedPlatforms.add(platform);
                        score += 10;
                        document.getElementById('score').textContent = `Score: ${score}`;
                        // Create special particles for platform scoring
                        createParticles(this.x, this.y, 8, '#ffff80');
                        
                        // Add a creative visual effect for landing on a new platform
                        this.createPlatformLandingEffect(platform);
                    }
                    
                    // Extra effect when phasing
                    if (this.isPhasing) {
                        this.velocityY *= 1.5;
                        createParticles(this.x, this.y, 15, '#d080ff');
                    }
                }
                break;
                
            case PLATFORM_TYPES.METEOR:
                // Fragile platform - break after landing
                if (this.velocityY > 0 && !this.onGround) { // Prevent multiple collisions
                    this.velocityY = JUMP_FORCE;
                    this.onGround = true;
                    this.jumps = 0;
                    platform.broken = true;
                    createParticles(platform.x + platform.width/2, platform.y, 15, '#ff6040');
                    
                    // Add 10 points for landing on a new platform
                    if (!this.visitedPlatforms.has(platform)) {
                        this.visitedPlatforms.add(platform);
                        score += 10;
                        document.getElementById('score').textContent = `Score: ${score}`;
                        // Create special particles for platform scoring
                        createParticles(this.x, this.y, 8, '#ffff80');
                        
                        // Add a creative visual effect for landing on a new platform
                        this.createPlatformLandingEffect(platform);
                    }
                    
                    // Extra particles when magnet is active
                    if (this.hasMagnet) {
                        createParticles(platform.x + platform.width/2, platform.y, 10, '#ff8080');
                    }
                }
                break;
                
            case PLATFORM_TYPES.BLACK_HOLE:
                // Gravity reversal
                if (this.velocityY > 0 && !this.onGround) { // Prevent multiple collisions
                    this.velocityY = JUMP_FORCE;
                    this.onGround = true;
                    this.jumps = 0;
                    currentGravity *= -1; // Reverse gravity temporarily
                    setTimeout(() => currentGravity *= -1, BLACK_HOLE_REVERSE_TIME); // Reset after 3 seconds
                    createParticles(this.x, this.y, 20, '#202040');
                    
                    // Add 10 points for landing on a new platform
                    if (!this.visitedPlatforms.has(platform)) {
                        this.visitedPlatforms.add(platform);
                        score += 10;
                        document.getElementById('score').textContent = `Score: ${score}`;
                        // Create special particles for platform scoring
                        createParticles(this.x, this.y, 8, '#ffff80');
                        
                        // Add a creative visual effect for landing on a new platform
                        this.createPlatformLandingEffect(platform);
                    }
                    
                    // Extra effect during time warp
                    if (gameSpeed < 1) {
                        createParticles(this.x, this.y, 25, '#404080');
                    }
                }
                break;
                
            case PLATFORM_TYPES.COMET:
                // Slippery platform - high speed
                if (this.velocityY > 0 && !this.onGround) { // Prevent multiple collisions
                    this.velocityY = JUMP_FORCE * 0.8;
                    this.onGround = true;
                    this.jumps = 0;
                    this.velocityX *= COMET_SPEED_BOOST; // Speed boost
                    createParticles(this.x, this.y, 8, '#40a0ff');
                    
                    // Add 10 points for landing on a new platform
                    if (!this.visitedPlatforms.has(platform)) {
                        this.visitedPlatforms.add(platform);
                        score += 10;
                        document.getElementById('score').textContent = `Score: ${score}`;
                        // Create special particles for platform scoring
                        createParticles(this.x, this.y, 8, '#ffff80');
                        
                        // Add a creative visual effect for landing on a new platform
                        this.createPlatformLandingEffect(platform);
                    }
                    
                    // Extra speed during time warp
                    if (gameSpeed < 1) {
                        this.velocityX *= 1.5;
                    }
                }
                break;
                
            case PLATFORM_TYPES.STAR:
                // Healing platform
                if (this.velocityY > 0 && !this.onGround) { // Prevent multiple collisions
                    this.velocityY = JUMP_FORCE;
                    this.onGround = true;
                    this.jumps = 0;
                    if (this.hasShield) this.shieldTime += 300;
                    createParticles(this.x, this.y, 15, '#ffffff');
                    
                    // Add 10 points for landing on a new platform
                    if (!this.visitedPlatforms.has(platform)) {
                        this.visitedPlatforms.add(platform);
                        score += 10;
                        document.getElementById('score').textContent = `Score: ${score}`;
                        // Create special particles for platform scoring
                        createParticles(this.x, this.y, 8, '#ffff80');
                        
                        // Add a creative visual effect for landing on a new platform
                        this.createPlatformLandingEffect(platform);
                    }
                    
                    // Extra healing when phasing
                    if (this.isPhasing) {
                        if (this.hasShield) this.shieldTime += 150;
                        combo += 2;
                        document.getElementById('combo').textContent = `Combo: ${combo}`;
                    }
                }
                break;
        }
    }
    
    // New creative method to create visual effects when landing on a new platform
    createPlatformLandingEffect(platform) {
        // Create a ripple effect around the platform
        for (let i = 0; i < 15; i++) {
            const angle = (i / 15) * Math.PI * 2;
            const distance = 30 + Math.sin(Date.now() / 100 + i) * 10;
            const x = platform.x + platform.width/2 + Math.cos(angle) * distance;
            const y = platform.y + platform.height/2 + Math.sin(angle) * distance;
            particles.push(new Particle(x, y, '#ffff80'));
        }
        
        // Create a score popup effect
        particles.push(new ScorePopupParticle(
            platform.x + platform.width/2,
            platform.y + platform.height/2,
            '+10'
        ));
    }

    collectPowerUp(powerUp) {
        // Mark power-up as collected to prevent double collection
        if (powerUp.collected) return;
        powerUp.collected = true;
        
        switch (powerUp.type) {
            case POWER_UP_TYPES.STARDUST:
                score += 50;
                createParticles(this.x, this.y, 15, '#ffff80');
                
                // Track stardust collection
                if (!this.stardustCount) this.stardustCount = 0;
                this.stardustCount++;
                
                // Special ability when collecting many stardust
                if (this.stardustCount % 25 === 0) {
                    // Temporary speed boost
                    const originalSpeed = this.velocityX;
                    this.velocityX *= 2;
                    setTimeout(() => this.velocityX = originalSpeed, 2000);
                    
                    // Visual effect
                    createParticles(this.x, this.y, 30, '#ffffff');
                }
                break;
                
            case POWER_UP_TYPES.CRYSTAL:
                this.hasShield = true;
                this.shieldTime = 600; // 10 seconds
                createParticles(this.x, this.y, 20, '#80ffff');
                
                // Track crystal collection
                if (!this.crystalCount) this.crystalCount = 0;
                this.crystalCount++;
                
                // Extended shield when collecting many crystals
                if (this.crystalCount % 5 === 0) {
                    this.shieldTime += 300; // Extra 5 seconds
                    createParticles(this.x, this.y, 25, '#ffffff');
                }
                break;
                
            case POWER_UP_TYPES.PULSAR:
                this.maxJumps = 3;
                this.jumps = 0; // Reset jumps
                createParticles(this.x, this.y, 25, '#ff80ff');
                
                // Track pulsar collection
                if (!this.pulsarCount) this.pulsarCount = 0;
                this.pulsarCount++;
                
                // Extra jump when collecting many pulsars
                if (this.pulsarCount % 3 === 0) {
                    this.maxJumps++;
                    createParticles(this.x, this.y, 30, '#ffffff');
                }
                break;
                
            case POWER_UP_TYPES.TIME_WARP:
                gameSpeed = 0.3; // Slow down game
                setTimeout(() => gameSpeed = 1, TIME_WARP_DURATION);
                createParticles(this.x, this.y, 30, '#40ffff');
                
                // Track time warp collection
                if (!this.timeWarpCount) this.timeWarpCount = 0;
                this.timeWarpCount++;
                
                // Extended time warp when collecting many
                if (this.timeWarpCount % 3 === 0) {
                    setTimeout(() => gameSpeed = 1, TIME_WARP_DURATION * 2);
                    createParticles(this.x, this.y, 35, '#ffffff');
                }
                
                // Bonus points when collecting during slow time
                if (gameSpeed < 1) {
                    score += 100;
                    document.getElementById('score').textContent = `Score: ${score}`;
                }
                break;
                
            case POWER_UP_TYPES.MAGNET:
                this.hasMagnet = true;
                setTimeout(() => this.hasMagnet = false, MAGNET_DURATION);
                createParticles(this.x, this.y, 25, '#ff8080');
                
                // Track magnet collection
                if (!this.magnetCount) this.magnetCount = 0;
                this.magnetCount++;
                
                // Extended magnet when collecting many
                if (this.magnetCount % 3 === 0) {
                    setTimeout(() => this.hasMagnet = false, MAGNET_DURATION * 2);
                    createParticles(this.x, this.y, 30, '#ffffff');
                }
                break;
                
            case POWER_UP_TYPES.NEBULA_SHIFT:
                this.isPhasing = true;
                setTimeout(() => this.isPhasing = false, 3000);
                createParticles(this.x, this.y, 35, '#a040ff');
                
                // Track nebula shift collection
                if (!this.nebulaShiftCount) this.nebulaShiftCount = 0;
                this.nebulaShiftCount++;
                
                // Extended phasing when collecting many
                if (this.nebulaShiftCount % 3 === 0) {
                    setTimeout(() => this.isPhasing = false, 6000);
                    createParticles(this.x, this.y, 40, '#ffffff');
                }
                break;
        }
        
        // Ensure score doesn't go below 0
        if (score < 0) score = 0;
        document.getElementById('score').textContent = `Score: ${score}`;
        
        // Bonus for collecting while invincible
        if (this.isInvincible) {
            score += 100;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 15, '#ffffff');
        }
        
        // Bonus for collecting while phasing
        if (this.isPhasing) {
            score += 50;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 10, '#a040ff');
        }
        
        // Bonus for collecting while magnet is active
        if (this.hasMagnet) {
            score += 30;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 8, '#ff8080');
        }
        
        // Bonus for collecting while shielded
        if (this.hasShield) {
            score += 20;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 6, '#80ffff');
        }
        
        // Bonus for collecting during high speed
        if (gameSpeed > 1.5) {
            score += 75;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 12, '#ff4040');
        }
        
        // Bonus for collecting during slow speed
        if (gameSpeed < 0.5) {
            score += 150;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 18, '#40ffff');
        }
        
        // Bonus for collecting while on the ground
        if (this.onGround) {
            score += 25;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 5, '#ffffff');
        }
        
        // Bonus for collecting while in the air
        if (!this.onGround) {
            score += 40;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 8, '#a0a0ff');
        }
        
        // Bonus for collecting while moving fast horizontally
        if (Math.abs(this.velocityX) > 6) {
            score += 60;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 10, '#40a0ff');
        }
        
        // Bonus for collecting while moving fast vertically
        if (Math.abs(this.velocityY) > 8) {
            score += 60;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 10, '#ff40a0');
        }
        
        // Bonus for collecting near the top of the screen
        if (this.y < canvas.height * 0.3) {
            score += 80;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 15, '#d080ff');
        }
        
        // Bonus for collecting near the bottom of the screen
        if (this.y > canvas.height * 0.7) {
            score += 80;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 15, '#40ff80');
        }
        
        // Bonus for collecting near the edges of the screen
        if (this.x < canvas.width * 0.2 || this.x > canvas.width * 0.8) {
            score += 70;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 12, '#ff8040');
        }
        
        // Bonus for collecting in the center of the screen
        if (this.x > canvas.width * 0.4 && this.x < canvas.width * 0.6) {
            score += 90;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 18, '#8040ff');
        }
        
        // Quick collection combo
        const currentTime = Date.now();
        if (currentTime - this.lastPowerUpTime < 2000) { // Within 2 seconds
            this.quickCollectCombo++;
            
            // Bonus for quick collection
            if (this.quickCollectCombo >= 3) {
                score += this.quickCollectCombo * 20;
                if (score < 0) score = 0; // Ensure score doesn't go below 0
                document.getElementById('score').textContent = `Score: ${score}`;
                
                // Visual effect
                createParticles(this.x, this.y, 20, '#ffffff');
            }
        } else {
            this.quickCollectCombo = 0;
        }
        this.lastPowerUpTime = currentTime;
        
        // Track same type collection streak
        if (!this.lastPowerUpType) this.lastPowerUpType = powerUp.type;
        if (!this.sameTypeStreak) this.sameTypeStreak = 0;
        
        if (this.lastPowerUpType === powerUp.type) {
            this.sameTypeStreak++;
            
            // Bonus for collecting same type multiple times
            if (this.sameTypeStreak >= 3) {
                score += this.sameTypeStreak * 30;
                if (score < 0) score = 0; // Ensure score doesn't go below 0
                document.getElementById('score').textContent = `Score: ${score}`;
                createParticles(this.x, this.y, 15, '#ffffff');
            }
        } else {
            this.sameTypeStreak = 1;
        }
        this.lastPowerUpType = powerUp.type;
        
        // Track power-up sequence
        if (!this.powerUpSequence) this.powerUpSequence = [];
        this.powerUpSequence.push(powerUp.type);
        if (this.powerUpSequence.length > 5) {
            this.powerUpSequence.shift();
        }
        
        // Check for special sequences
        if (this.powerUpSequence.length >= 3) {
            // Check for alternating sequence (STARDUST, CRYSTAL, STARDUST, ...)
            let isAlternating = true;
            for (let i = 1; i < this.powerUpSequence.length; i++) {
                if (i % 2 === 0 && this.powerUpSequence[i] !== this.powerUpSequence[0]) {
                    isAlternating = false;
                    break;
                } else if (i % 2 === 1 && this.powerUpSequence[i] !== this.powerUpSequence[1]) {
                    isAlternating = false;
                    break;
                }
            }
            
            if (isAlternating && this.powerUpSequence.length >= 4) {
                score += 200;
                if (score < 0) score = 0; // Ensure score doesn't go below 0
                document.getElementById('score').textContent = `Score: ${score}`;
                createParticles(this.x, this.y, 30, '#ffff80');
            }
        }
        
        // Track collected power-up types
        if (!this.collectedPowerUps) {
            this.collectedPowerUps = new Set();
        }
        this.collectedPowerUps.add(powerUp.type);
        
        // Combo bonus
        combo++;
        if (combo % 5 === 0) {
            score += combo * 10; // Combo bonus
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            
            // Special effect for high combo
            if (combo % 10 === 0) {
                createParticles(this.x, this.y, 50, '#ffffff');
            }
            
            // Super combo effect
            if (combo % 20 === 0) {
                // Create a wave of particles
                for (let i = 0; i < 30; i++) {
                    const angle = (i / 30) * Math.PI * 2;
                    const distance = 100;
                    particles.push(new Particle(
                        this.x + Math.cos(angle) * distance,
                        this.y + Math.sin(angle) * distance,
                        '#ffff80'
                    ));
                }
                
                // Screen shake for high combos
                screenShake = 10;
                screenShakeIntensity = 5;
                
                // Temporary invincibility at very high combos
                if (combo >= 50 && !this.isInvincible) {
                    this.isInvincible = true;
                    setTimeout(() => this.isInvincible = false, 3000);
                    
                    // Visual effect for invincibility
                    for (let i = 0; i < 50; i++) {
                        particles.push(new Particle(
                            this.x + (Math.random() - 0.5) * 50,
                            this.y + (Math.random() - 0.5) * 50,
                            '#ffffff'
                        ));
                    }
                }
            }
        }
        
        // Bonus for collecting power-ups at high combo
        if (combo > 30) {
            score += combo;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
        }
        
        // Bonus for collecting power-ups while at maximum jumps
        if (this.jumps >= this.maxJumps) {
            score += 100;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 20, '#ff80ff');
        }
        
        // Bonus for collecting power-ups while at low jumps (fresh start)
        if (this.jumps === 0) {
            score += 50;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 10, '#40ff40');
        }
        
        // Bonus for collecting power-ups after a long time (patience reward)
        if (this.lastPowerUpTime > 0 && Date.now() - this.lastPowerUpTime > 5000) {
            score += 150;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 25, '#ffff40');
        }
        
        // Bonus for collecting power-ups in quick succession (speed reward)
        if (this.lastPowerUpTime > 0 && Date.now() - this.lastPowerUpTime < 500) {
            score += 100;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 20, '#40ffff');
        }
        
        // Bonus for collecting power-ups with a full combo
        if (this.quickCollectCombo >= 5) {
            score += 200;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            createParticles(this.x, this.y, 30, '#ff40ff');
        }
        
        // Special effect for collecting all power-up types
        if (this.collectedPowerUps.size === Object.keys(POWER_UP_TYPES).length) {
            // Create a spectacular effect
            for (let i = 0; i < 100; i++) {
                const angle = (i / 100) * Math.PI * 2;
                const distance = 150;
                particles.push(new Particle(
                    this.x + Math.cos(angle) * distance,
                    this.y + Math.sin(angle) * distance,
                    '#ffffff'
                ));
            }
            
            // Bonus points
            score += 500;
            if (score < 0) score = 0; // Ensure score doesn't go below 0
            document.getElementById('score').textContent = `Score: ${score}`;
            
            // Reset collected power-ups
            this.collectedPowerUps.clear();
        }
        
        document.getElementById('combo').textContent = `Combo: ${combo}`;
    }
    
    jump() {
        if (this.jumps < this.maxJumps) {
            this.velocityY = JUMP_FORCE;
            this.jumps++;
            this.onGround = false;
            createParticles(this.x, this.y, 5, '#ffffff');
        }
    }
    
    draw() {
        // Draw trail
        for (let i = 0; i < this.trail.length; i++) {
            const point = this.trail[i];
            const alpha = i / this.trail.length;
            ctx.beginPath();
            ctx.arc(point.x, point.y, this.radius * alpha, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(106, 106, 255, ${alpha * 0.5})`;
            ctx.fill();
        }
        
        // Draw shield if active
        if (this.hasShield) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 5, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(100, 255, 255, ${Math.abs(Math.sin(Date.now()/200))})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        // Draw magnet effect
        if (this.hasMagnet) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, 200, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 100, 100, 0.2)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        // Draw phasing effect
        if (this.isPhasing) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(160, 64, 255, ${Math.abs(Math.sin(Date.now()/100))})`;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        
        // Draw invincibility effect
        if (this.isInvincible) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 10, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 255, 255, ${Math.abs(Math.sin(Date.now()/50))})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        // Draw player
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        
        // Create gradient for glow effect
        const gradient = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.radius
        );
        
        // Change color based on active abilities
        let centerColor = '#ffffff';
        let edgeColor = this.color;
        
        if (this.hasMagnet) {
            centerColor = '#ff8080';
            edgeColor = '#ff4040';
        } else if (this.isPhasing) {
            centerColor = '#d080ff';
            edgeColor = '#a040ff';
        } else if (this.hasShield) {
            centerColor = '#80ffff';
            edgeColor = '#40c0ff';
        }
        
        gradient.addColorStop(0, centerColor);
        gradient.addColorStop(0.7, edgeColor);
        gradient.addColorStop(1, this.glowColor);
        
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Glow effect
        ctx.shadowColor = edgeColor;
        ctx.shadowBlur = 20;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// Platform class
class Platform {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.width = PLATFORM_WIDTH;
        this.height = PLATFORM_HEIGHT;
        this.type = type;
        this.broken = false;
        this.color = this.getColor();
        this.glowColor = this.getGlowColor();
        this.angle = 0; // For twisted platforms
    }
    
    getColor() {
        switch (this.type) {
            case PLATFORM_TYPES.NEBULA: return '#a040ff';
            case PLATFORM_TYPES.METEOR: return '#ff6040';
            case PLATFORM_TYPES.BLACK_HOLE: return '#202040';
            case PLATFORM_TYPES.COMET: return '#40a0ff';
            case PLATFORM_TYPES.STAR: return '#ffff40';
            case PLATFORM_TYPES.SPIKE: return '#ff4080'; // Cosmic spike color
            case PLATFORM_TYPES.SPIKE_TWISTED: return '#c040ff'; // Twisted cosmic spike color
            default: return '#6060a0';
        }
    }
    
    getGlowColor() {
        switch (this.type) {
            case PLATFORM_TYPES.NEBULA: return '#d080ff';
            case PLATFORM_TYPES.METEOR: return '#ff9070';
            case PLATFORM_TYPES.BLACK_HOLE: return '#505080';
            case PLATFORM_TYPES.COMET: return '#70d0ff';
            case PLATFORM_TYPES.STAR: return '#ffffff';
            case PLATFORM_TYPES.SPIKE: return '#ff80c0'; // Cosmic spike glow
            case PLATFORM_TYPES.SPIKE_TWISTED: return '#e080ff'; // Twisted cosmic spike glow
            default: return '#9090d0';
        }
    }
    
    update() {
        // Move with camera
        this.y += SCROLL_SPEED;
        
        // Spike platforms fall downward
        if (this.type === PLATFORM_TYPES.SPIKE) {
            this.y += 2; // Fall speed
        }
        
        // Twisted spike platforms fall downward with rotation
        if (this.type === PLATFORM_TYPES.SPIKE_TWISTED) {
            this.y += 3; // Faster fall speed
            this.angle = Math.sin(Date.now() / 300) * 0.2; // Twisting motion
        }
        
        // Mark for removal if off screen
        return this.y > canvas.height + 100;
    }
    
    draw() {
        if (this.broken) return;
        
        // Save context for rotation
        ctx.save();
        
        // Apply rotation for twisted platforms
        if (this.type === PLATFORM_TYPES.SPIKE_TWISTED) {
            ctx.translate(this.x + this.width/2, this.y + this.height/2);
            ctx.rotate(this.angle);
            ctx.translate(-(this.x + this.width/2), -(this.y + this.height/2));
        }
        
        ctx.beginPath();
        ctx.rect(this.x, this.y, this.width, this.height);
        
        // Create gradient for platform
        const gradient = ctx.createLinearGradient(
            this.x, this.y, 
            this.x, this.y + this.height
        );
        gradient.addColorStop(0, this.glowColor);
        gradient.addColorStop(1, this.color);
        
        ctx.fillStyle = gradient;
        
        // Glow effect
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Platform-specific details
        switch (this.type) {
            case PLATFORM_TYPES.NEBULA:
                // Nebula cloud effect
                ctx.beginPath();
                ctx.arc(this.x + this.width/2, this.y + this.height/2, this.width/3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(160, 64, 255, 0.3)';
                ctx.fill();
                break;
                
            case PLATFORM_TYPES.METEOR:
                // Meteor cracks
                ctx.strokeStyle = '#ff9070';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(this.x + 10, this.y + 5);
                ctx.lineTo(this.x + 30, this.y + 15);
                ctx.moveTo(this.x + 70, this.y + 10);
                ctx.lineTo(this.x + 90, this.y + 5);
                ctx.moveTo(this.x + 40, this.y + 15);
                ctx.lineTo(this.x + 60, this.y + 5);
                ctx.stroke();
                break;
                
            case PLATFORM_TYPES.BLACK_HOLE:
                // Swirling effect
                ctx.beginPath();
                ctx.arc(this.x + this.width/2, this.y + this.height/2, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#000000';
                ctx.fill();
                break;
                
            case PLATFORM_TYPES.COMET:
                // Comet trail
                ctx.beginPath();
                ctx.moveTo(this.x, this.y + this.height/2);
                ctx.lineTo(this.x - 20, this.y + this.height/2);
                ctx.strokeStyle = '#70d0ff';
                ctx.lineWidth = 2;
                ctx.stroke();
                break;
                
            case PLATFORM_TYPES.STAR:
                // Star points
                ctx.beginPath();
                for (let i = 0; i < 5; i++) {
                    const angle = (i * 2 * Math.PI / 5) - Math.PI/2;
                    const x = this.x + this.width/2 + Math.cos(angle) * 8;
                    const y = this.y + this.height/2 + Math.sin(angle) * 8;
                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.closePath();
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                break;
                
            case PLATFORM_TYPES.SPIKE:
                // Draw cosmic spike details
                ctx.fillStyle = '#ff60a0';
                
                // Draw spikes on top of platform
                const spikeCount = 5;
                const spikeWidth = this.width / spikeCount;
                for (let i = 0; i < spikeCount; i++) {
                    const spikeX = this.x + i * spikeWidth + spikeWidth / 2;
                    ctx.beginPath();
                    ctx.moveTo(spikeX - spikeWidth/3, this.y);
                    ctx.lineTo(spikeX, this.y - 10);
                    ctx.lineTo(spikeX + spikeWidth/3, this.y);
                    ctx.closePath();
                    ctx.fill();
                }
                
                // Add glow effect for cosmic appearance
                ctx.shadowColor = '#ff80c0';
                ctx.shadowBlur = 10;
                ctx.fill();
                ctx.shadowBlur = 0;
                break;
                
            case PLATFORM_TYPES.SPIKE_TWISTED:
                // Draw twisted cosmic spike details
                ctx.fillStyle = '#c060ff';
                
                // Draw twisted spikes on top of platform
                const twistedSpikeCount = 5;
                const twistedSpikeWidth = this.width / twistedSpikeCount;
                for (let i = 0; i < twistedSpikeCount; i++) {
                    const spikeX = this.x + i * twistedSpikeWidth + twistedSpikeWidth / 2;
                    const twist = Math.sin(Date.now() / 200 + i) * 3; // Animation twist effect
                    
                    ctx.beginPath();
                    ctx.moveTo(spikeX - twistedSpikeWidth/3, this.y);
                    ctx.lineTo(spikeX + twist, this.y - 12);
                    ctx.lineTo(spikeX + twistedSpikeWidth/3, this.y);
                    ctx.closePath();
                    ctx.fill();
                }
                
                // Add glow effect for cosmic appearance
                ctx.shadowColor = '#e080ff';
                ctx.shadowBlur = 12;
                ctx.fill();
                ctx.shadowBlur = 0;
                
                // Add twisting animation effect
                ctx.beginPath();
                ctx.arc(this.x + this.width/2, this.y + this.height/2, this.width/4, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(224, 128, 255, 0.5)';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 3]);
                ctx.stroke();
                ctx.setLineDash([]);
                break;
        }
        
        // Restore context
        ctx.restore();
    }
}

// Hazard class
class Hazard {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.width = PLATFORM_WIDTH * 0.7;
        this.height = PLATFORM_HEIGHT * 0.7;
        this.color = this.getColor();
        this.angle = 0;
        this.pulse = 0;
    }
    
    getColor() {
        switch (this.type) {
            case HAZARD_TYPES.ASTEROID_SPIKE: return '#ff4040';
            case HAZARD_TYPES.DARK_VOID: return '#101030';
            case HAZARD_TYPES.UNSTABLE_PLATFORM: return '#806060';
            default: return '#ff0000';
        }
    }
    
    update() {
        this.y += SCROLL_SPEED * gameSpeed;
        this.angle += 0.05;
        this.pulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;
        return this.y > canvas.height + 50;
    }
    
    draw() {
        ctx.save();
        ctx.translate(this.x + this.width/2, this.y + this.height/2);
        ctx.rotate(this.angle);
        
        switch (this.type) {
            case HAZARD_TYPES.ASTEROID_SPIKE:
                // Draw spiky asteroid
                ctx.beginPath();
                for (let i = 0; i < 8; i++) {
                    const angle = (i * Math.PI / 4);
                    const radius = i % 2 === 0 ? this.width/2 : this.width/3;
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;
                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.closePath();
                ctx.fillStyle = this.color;
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 10;
                ctx.fill();
                break;
                
            case HAZARD_TYPES.DARK_VOID:
                // Draw dark void with swirling effect
                ctx.beginPath();
                ctx.arc(0, 0, this.width/2 * this.pulse, 0, Math.PI * 2);
                const voidGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.width/2 * this.pulse);
                voidGradient.addColorStop(0, 'rgba(20, 20, 60, 0.8)');
                voidGradient.addColorStop(1, 'rgba(5, 5, 20, 0.2)');
                ctx.fillStyle = voidGradient;
                ctx.fill();
                
                // Swirling lines
                ctx.strokeStyle = 'rgba(100, 100, 200, 0.5)';
                ctx.lineWidth = 2;
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    ctx.arc(0, 0, (this.width/4) + i * 3, this.angle + i, this.angle + i + Math.PI);
                    ctx.stroke();
                }
                break;
                
            case HAZARD_TYPES.UNSTABLE_PLATFORM:
                // Draw unstable platform with cracks
                ctx.beginPath();
                ctx.rect(-this.width/2, -this.height/2, this.width, this.height);
                ctx.fillStyle = this.color;
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 8;
                ctx.fill();
                
                // Cracks
                ctx.strokeStyle = '#ff8080';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(-this.width/3, -this.height/4);
                ctx.lineTo(this.width/4, this.height/3);
                ctx.moveTo(0, -this.height/3);
                ctx.lineTo(this.width/5, this.height/4);
                ctx.stroke();
                break;
        }
        
        ctx.restore();
    }
}

// Power-up class
class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.radius = 10;
        this.color = this.getColor();
        this.angle = 0;
    }
    
    getColor() {
        switch (this.type) {
            case POWER_UP_TYPES.STARDUST: return '#ffff80';
            case POWER_UP_TYPES.CRYSTAL: return '#80ffff';
            case POWER_UP_TYPES.PULSAR: return '#ff80ff';
            case POWER_UP_TYPES.TIME_WARP: return '#40ffff';
            case POWER_UP_TYPES.MAGNET: return '#ff8080';
            case POWER_UP_TYPES.NEBULA_SHIFT: return '#a040ff';
            default: return '#ffffff';
        }
    }
    
    update() {
        this.y += SCROLL_SPEED;
        this.angle += 0.1;
        return this.y > canvas.height + 50;
    }
    
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        
        // Pulsing effect
        const pulse = Math.abs(Math.sin(this.angle)) * 0.5 + 0.5;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 15 * pulse;
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Type-specific drawing
        switch (this.type) {
            case POWER_UP_TYPES.STARDUST:
                // Sparkle effect
                ctx.beginPath();
                ctx.moveTo(this.x, this.y - this.radius);
                ctx.lineTo(this.x, this.y - this.radius - 5);
                ctx.moveTo(this.x, this.y + this.radius);
                ctx.lineTo(this.x, this.y + this.radius + 5);
                ctx.moveTo(this.x - this.radius, this.y);
                ctx.lineTo(this.x - this.radius - 5, this.y);
                ctx.moveTo(this.x + this.radius, this.y);
                ctx.lineTo(this.x + this.radius + 5, this.y);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();
                break;
                
            case POWER_UP_TYPES.CRYSTAL:
                // Crystal facets
                ctx.beginPath();
                ctx.moveTo(this.x, this.y - this.radius);
                ctx.lineTo(this.x + this.radius * 0.7, this.y);
                ctx.lineTo(this.x, this.y + this.radius);
                ctx.lineTo(this.x - this.radius * 0.7, this.y);
                ctx.closePath();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();
                break;
                
            case POWER_UP_TYPES.PULSAR:
                // Pulsar rings
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * 0.7, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * 0.4, 0, Math.PI * 2);
                ctx.stroke();
                break;
                
            case POWER_UP_TYPES.TIME_WARP:
                // Time warp spiral
                ctx.beginPath();
                for (let i = 0; i < 3; i++) {
                    const angle = this.angle + i * Math.PI / 3;
                    const x = this.x + Math.cos(angle) * this.radius * 0.7;
                    const y = this.y + Math.sin(angle) * this.radius * 0.7;
                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();
                break;
                
            case POWER_UP_TYPES.MAGNET:
                // Magnet field lines
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
                ctx.moveTo(this.x - this.radius * 0.7, this.y);
                ctx.lineTo(this.x + this.radius * 0.7, this.y);
                ctx.moveTo(this.x, this.y - this.radius * 0.7);
                ctx.lineTo(this.x, this.y + this.radius * 0.7);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();
                break;
                
            case POWER_UP_TYPES.NEBULA_SHIFT:
                // Nebula waves
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * 0.3, 0, Math.PI * 2);
                ctx.moveTo(this.x - this.radius * 0.8, this.y);
                ctx.bezierCurveTo(
                    this.x - this.radius * 0.5, this.y - this.radius * 0.5,
                    this.x + this.radius * 0.5, this.y + this.radius * 0.5,
                    this.x + this.radius * 0.8, this.y
                );
                ctx.moveTo(this.x - this.radius * 0.8, this.y + this.radius * 0.3);
                ctx.bezierCurveTo(
                    this.x - this.radius * 0.5, this.y + this.radius * 0.8,
                    this.x + this.radius * 0.5, this.y - this.radius * 0.2,
                    this.x + this.radius * 0.8, this.y + this.radius * 0.3
                );
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();
                break;
        }
    }
}

// Particle system
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.velocityX = (Math.random() - 0.5) * 8;
        this.velocityY = (Math.random() - 0.5) * 8;
        this.color = color;
        this.life = 30;
        this.radius = Math.random() * 3 + 1;
    }
    
    update() {
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.velocityX *= 0.98;
        this.velocityY *= 0.98;
        this.life--;
        return this.life <= 0;
    }
    
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life / 30;
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

// Creative score popup particle for platform landing effects
class ScorePopupParticle {
    constructor(x, y, text) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.velocityY = -2; // Move upward
        this.life = 60; // Last for 60 frames
        this.alpha = 1;
    }
    
    update() {
        this.y += this.velocityY;
        this.velocityY *= 0.9; // Slow down over time
        this.life--;
        this.alpha = this.life / 60;
        return this.life <= 0;
    }
    
    draw() {
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(255, 255, 128, ${this.alpha})`; // Yellow color with alpha
        ctx.shadowColor = '#ffff80';
        ctx.shadowBlur = 10;
        ctx.fillText(this.text, this.x, this.y);
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';
    }
}

// Star background
class Star {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2;
        this.brightness = Math.random();
        this.speed = Math.random() * 0.05;
    }
    
    update() {
        this.brightness += this.speed;
        if (this.brightness > 1 || this.brightness < 0) {
            this.speed *= -1;
        }
    }
    
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${this.brightness})`;
        ctx.fill();
    }
}

// Create particles
function createParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color));
    }
}

// Initialize game
function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    // Create background stars
    for (let i = 0; i < STAR_COUNT; i++) {
        stars.push(new Star());
    }
    
    // Show title screen
    showTitleScreen();
    
    // Set up event listeners - only allow space key for jumping
    document.addEventListener('keydown', (e) => {
        keys[e.key] = true;
        // Only allow space key for jumping (remove 'w' and 'ArrowUp')
        if (e.key === ' ' && gameRunning) {
            player.jump();
        }
    });
    
    document.addEventListener('keyup', (e) => {
        keys[e.key] = false;
    });
}

// Show title screen
function showTitleScreen() {
    gameRunning = false;
    
    // Draw animated title screen
    function animateTitle() {
        if (!gameRunning) {
            drawBackground();
            
            // Pulsing title text
            const pulse = Math.abs(Math.sin(Date.now() / 1000)) * 0.5 + 0.5;
            
            ctx.font = '48px Arial';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#6a6aff';
            ctx.shadowBlur = 20 * pulse;
            ctx.fillText('COSMIC BALL', canvas.width/2, canvas.height/2 - 100);
            
            ctx.font = '24px Arial';
            ctx.shadowBlur = 10 * pulse;
            ctx.fillText('A cosmic platformer adventure', canvas.width/2, canvas.height/2 - 40);
            
            ctx.font = '20px Arial';
            ctx.shadowBlur = 5;
            ctx.fillText('Use Arrow Keys or A/D to move', canvas.width/2, canvas.height/2 + 20);
            ctx.fillText('Press Space to jump', canvas.width/2, canvas.height/2 + 60);
            
            // Blinking start text
            if (Math.sin(Date.now() / 500) > 0) {
                ctx.fillText('Press SPACE to start', canvas.width/2, canvas.height/2 + 120);
            }
            
            ctx.shadowBlur = 0;
            ctx.textAlign = 'left';
            
            requestAnimationFrame(animateTitle);
        }
    }
    
    animateTitle();
    
    // Start game on space press
    const startHandler = (e) => {
        if (e.key === ' ') {
            document.removeEventListener('keydown', startHandler);
            startGame();
        }
    };
    document.addEventListener('keydown', startHandler);
}

// Start the actual game
function startGame() {
    gameRunning = true;
    
    // Reset game state
    platforms = [];
    powerUps = [];
    hazards = [];
    particles = [];
    score = 0;
    combo = 0;
    currentGravity = GRAVITY;
    gameSpeed = 1;
    
    // Create player
    player = new Player();
    
    // Create initial platforms
    createInitialPlatforms();
    
    // Update score display
    document.getElementById('highScore').textContent = `High Score: ${highScore}`;
    document.getElementById('score').textContent = `Score: ${score}`;
    document.getElementById('speed').textContent = `Speed: ${gameSpeed.toFixed(1)}x`;
    document.getElementById('combo').textContent = `Combo: ${combo}`;
    
    // Start game loop
    requestAnimationFrame(gameLoop);
}

// Create initial platforms
function createInitialPlatforms() {
    // Starting platform
    platforms.push(new Platform(canvas.width/2 - PLATFORM_WIDTH/2, canvas.height - 50, PLATFORM_TYPES.STAR));
    
    // Generate platforms going upward with equal spacing and no overlap
    const verticalSpacing = 100; // Equal vertical gap between platforms
    
    for (let y = canvas.height - 150; y > -2000; y -= verticalSpacing) {
        // Randomly decide how many platforms in this row
        const platformsInThisRow = Math.floor(Math.random() * 3) + 1;
        
        for (let i = 0; i < platformsInThisRow; i++) {
            // Random x position that ensures no overlap
            const x = Math.random() * (canvas.width - PLATFORM_WIDTH);
            const type = getRandomPlatformType();
            platforms.push(new Platform(x, y, type));
        }
        
        // Occasionally add power-ups
        if (Math.random() > 0.7) {
            const x = Math.random() * (canvas.width - 50) + 25;
            const type = getRandomPowerUpType();
            powerUps.push(new PowerUp(x, y - 30, type));
        }
        
        // Occasionally add hazards
        if (Math.random() > 0.8) {
            const x = Math.random() * (canvas.width - 50) + 25;
            const type = getRandomHazardType();
            hazards.push(new Hazard(x, y - 60, type));
        }
    }
}

// Generate new platforms as player ascends
function generateNewPlatforms() {
    const highestPlatform = Math.min(...platforms.map(p => p.y));
    
    // Generate new platforms if needed
    if (highestPlatform > -canvas.height * 2) {
        const verticalSpacing = 100; // Equal vertical gap between platforms
        const horizontalSpacing = PLATFORM_WIDTH + 20; // Equal horizontal gap between platforms (20px gap)
        const platformsPerRow = Math.floor(canvas.width / horizontalSpacing);
        
        for (let y = highestPlatform - verticalSpacing; y > highestPlatform - 300; y -= verticalSpacing) {
            // Create platforms with equal spacing
            const platformsInThisRow = Math.min(platformsPerRow, Math.floor(Math.random() * 3) + 1);
            
            // Calculate positions to ensure equal spacing
            const totalWidth = platformsInThisRow * PLATFORM_WIDTH + (platformsInThisRow - 1) * 20;
            const startX = (canvas.width - totalWidth) / 2;
            
            for (let i = 0; i < platformsInThisRow; i++) {
                const x = startX + i * horizontalSpacing;
                const type = getRandomPlatformType();
                platforms.push(new Platform(x, y, type));
            }
            
            // Occasionally add power-ups
            if (Math.random() > 0.7) {
                const x = Math.random() * (canvas.width - 50) + 25;
                const type = getRandomPowerUpType();
                powerUps.push(new PowerUp(x, y - 30, type));
            }
        }
    }
}

// Get random platform type
function getRandomPlatformType() {
    const types = Object.values(PLATFORM_TYPES);
    // Lower chance for spike platforms (10% chance)
    const rand = Math.random();
    if (rand < 0.05) {
        return PLATFORM_TYPES.SPIKE_TWISTED; // 5% chance for twisted spikes
    } else if (rand < 0.1) {
        return PLATFORM_TYPES.SPIKE; // 5% chance for regular spikes
    }
    return types[Math.floor(Math.random() * (types.length - 2))]; // Exclude spike types
}

// Get random power-up type
function getRandomPowerUpType() {
    const types = Object.values(POWER_UP_TYPES);
    return types[Math.floor(Math.random() * types.length)];
}

// Get random hazard type
function getRandomHazardType() {
    const types = Object.values(HAZARD_TYPES);
    return types[Math.floor(Math.random() * types.length)];
}

// Draw cosmic background
function drawBackground() {
    // Draw gradient background
    const gradient = ctx.createRadialGradient(
        canvas.width/2, canvas.height/2, 0,
        canvas.width/2, canvas.height/2, Math.max(canvas.width, canvas.height)
    );
    gradient.addColorStop(0, '#0a0a20');
    gradient.addColorStop(1, '#050510');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw distant galaxies
    for (let i = 0; i < 5; i++) {
        const x = (Math.sin(Date.now()/5000 + i) * canvas.width/3) + canvas.width/2;
        const y = (Math.cos(Date.now()/6000 + i) * canvas.height/3) + canvas.height/2;
        const radius = 50 + Math.sin(Date.now()/2000 + i) * 20;
        
        const galaxyGradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        galaxyGradient.addColorStop(0, `rgba(100, 80, ${150 + i * 20}, 0.3)`);
        galaxyGradient.addColorStop(1, 'rgba(50, 30, 100, 0)');
        
        ctx.fillStyle = galaxyGradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Draw nebula effects
    const nebulaGradient = ctx.createRadialGradient(
        canvas.width * 0.5, canvas.height * 0.2, 0,
        canvas.width * 0.5, canvas.height * 0.2, canvas.width * 0.8
    );
    nebulaGradient.addColorStop(0, 'rgba(120, 60, 200, 0.2)');
    nebulaGradient.addColorStop(1, 'rgba(20, 10, 60, 0)');
    
    ctx.fillStyle = nebulaGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw stars
    stars.forEach(star => {
        star.update();
        star.draw();
    });
    
    // Draw aurora effect
    const auroraGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    auroraGradient.addColorStop(0, 'rgba(100, 50, 200, 0.1)');
    auroraGradient.addColorStop(0.5, 'rgba(50, 100, 200, 0.15)');
    auroraGradient.addColorStop(1, 'rgba(200, 50, 150, 0.1)');
    
    ctx.fillStyle = auroraGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Main game loop
function gameLoop() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply screen shake
    if (screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * screenShakeIntensity;
        const shakeY = (Math.random() - 0.5) * screenShakeIntensity;
        ctx.save();
        ctx.translate(shakeX, shakeY);
        screenShake--;
    }
    
    // Draw background
    drawBackground();
    
    // Update and draw stars
    stars.forEach(star => {
        star.update();
        star.draw();
    });
    
    // Generate new platforms
    generateNewPlatforms();
    
    // Update player
    if (gameRunning) {
        player.update();
    }
    
    // Update platforms
    for (let i = platforms.length - 1; i >= 0; i--) {
        const remove = platforms[i].update();
        if (remove) {
            platforms.splice(i, 1);
        }
    }
    
    // Update hazards
    for (let i = hazards.length - 1; i >= 0; i--) {
        const remove = hazards[i].update();
        if (remove) {
            hazards.splice(i, 1);
        }
    }
    
    // Update power-ups
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const remove = powerUps[i].update();
        if (remove) {
            powerUps.splice(i, 1);
        }
    }
    
    // Update particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const remove = particles[i].update();
        if (remove) {
            particles.splice(i, 1);
        }
    }
    
    // Draw particles
    particles.forEach(particle => particle.draw());
    
    // Draw hazards
    hazards.forEach(hazard => hazard.draw());
    
    // Draw power-ups
    powerUps.forEach(powerUp => powerUp.draw());
    
    // Draw platforms
    platforms.forEach(platform => platform.draw());
    
    // Draw player
    player.draw();
    
    // Restore context if screen shake was applied
    if (screenShake > 0) {
        ctx.restore();
    }
    
    // Continue game loop
    requestAnimationFrame(gameLoop);
}

// Game over function
function gameOver() {
    gameRunning = false;
    
    // Create explosion particles
    createParticles(player.x, player.y, 100, '#ff4040');
    
    // Display game over screen
    setTimeout(() => {
        // Animated game over screen
        function animateGameOver() {
            if (!gameRunning) {
                // Darken background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Pulsing game over text
                const pulse = Math.abs(Math.sin(Date.now() / 800)) * 0.3 + 0.7;
                
                ctx.font = '48px Arial';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#ff4040';
                ctx.shadowBlur = 20 * pulse;
                ctx.fillText('GAME OVER', canvas.width/2, canvas.height/2 - 50);
                
                ctx.font = '24px Arial';
                ctx.shadowBlur = 10;
                ctx.fillText(`Final Score: ${score}`, canvas.width/2, canvas.height/2 + 20);
                ctx.fillText(`High Score: ${highScore}`, canvas.width/2, canvas.height/2 + 60);
                
                // Blinking restart text
                if (Math.sin(Date.now() / 500) > 0) {
                    ctx.fillText('Press R to Restart', canvas.width/2, canvas.height/2 + 120);
                }
                
                ctx.shadowBlur = 0;
                ctx.textAlign = 'left';
                
                requestAnimationFrame(animateGameOver);
            }
        }
        
        animateGameOver();
    }, 1000);
}

// Restart game function
function restartGame() {
    // Reset game state
    platforms = [];
    powerUps = [];
    hazards = [];
    particles = [];
    score = 0;
    combo = 0;
    gameRunning = true;
    currentGravity = GRAVITY;
    gameSpeed = 1;
    
    // Reset player
    player = new Player();
    
    // Create initial platforms
    createInitialPlatforms();
    
    // Update score display
    document.getElementById('score').textContent = `Score: ${score}`;
    document.getElementById('highScore').textContent = `High Score: ${highScore}`;
    document.getElementById('combo').textContent = `Combo: ${combo}`;
}

// Keyboard controls
document.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') {
        if (!gameRunning) {
            restartGame();
        }
    }
});

// Start the game when page loads
window.onload = init;