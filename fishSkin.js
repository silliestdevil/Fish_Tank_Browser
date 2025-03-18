//Import necessary modules from Three.js and other resources
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.112.1/build/three.module.js';
import {game} from './game.js';
import {math} from './math.js';
import {visibility} from './visibility.js';
import {OBJLoader} from 'https://cdn.jsdelivr.net/npm/three@0.112.1/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.112.1/examples/jsm/loaders/GLTFLoader.js';

// Initialize GLTFLoader to load 3D models in the GTLF format
const loader = new GLTFLoader(); // Now you can use GLTFLoader

// Variables for boid simulation and general permeters
let _APP = null;
 
const _BOID_SPEED = 20; //Speed of boids
const _BOID_ACCELERATION = _BOID_SPEED / 2.0; //Acceleration rate of boids
const _BOID_FORCE_MAX = _BOID_ACCELERATION / 5.0; //Maximum steering force
const _BOID_FORCE_ORIGIN = 8; //Force applied to boids to move towards origin
const _BOID_FORCE_ALIGNMENT = 30; //Force for alignment with nearby boids 
const _BOID_FORCE_SEPARATION = 5; //Force to seperate from other boids
const _BOID_FORCE_COHESION = 100; //Force to group with nearby boids
const _BOID_FORCE_WANDER = 3; // Force to make boids wander around
 
//Boid class for each fish in the simulation 
class Boid {

  constructor(game, params) {
    // Create the boid's mesh with provided geometry and material
    this._mesh = new THREE.Mesh(
      params.geometry, 
      params.material || new THREE.MeshStandardMaterial({ color: params.colour }) // Use material, fallback to color
    );
    this._mesh.castShadow = true;
    this._mesh.receiveShadow = false; 

    this._group = new THREE.Group();
    this._group.add(this._mesh); //Add the mesh to the group 

    
    // Set random starting position within a certain range 
    this._group.position.set(
      math.rand_range(5, 5),
      math.rand_range(0, 5),
      math.rand_range(5, 5)
    );

    this._group.rotation.z = Math.PI / 2; 
    this._group.rotation.y = math.rand_range(0, Math.PI * 2);
    // Set random direction for the boid
    this._direction = new THREE.Vector3(
        math.rand_range(-1, 1),
        0,
        math.rand_range(-1, 1));
    this._velocity = this._direction.clone();

    // Apply random speed and scaling 
    const speedMultiplier = math.rand_range(params.speedMin, params.speedMax);
    this._maxSteeringForce = params.maxSteeringForce * speedMultiplier;
    this._maxSpeed  = params.speed * speedMultiplier;  
    this._acceleration = params.acceleration * speedMultiplier;  

    const scale = 6.0 / speedMultiplier;
    this._radius = scale;
    this._mesh.scale.setScalar(scale); //Scale the mesh
    this._mesh.rotateX(-Math.PI / 2); //Rotate mesh to face correct direction 

    this._game = game;
    game._graphics.Scene.add(this._group);
 
    // update visibility grid with boids position
    this._visibilityIndex = game._visibilityGrid.UpdateItem(
        this._mesh.uuid, this);

    this._wanderAngle = 0; //Angle for wandering behaviour
  }

  //Display debug information, e.g., a red sphere at the boids position
  DisplayDebug() {
    const geometry = new THREE.SphereGeometry(10, 64, 64);
    const material = new THREE.MeshBasicMaterial({
      color: 0xFF0000,
      transparent: true,
      opacity: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    this._group.add(mesh);

    this._mesh.material.color.setHex(0xFF0000);
    this._displayDebug = true;
    this._lineRenderer = new LineRenderer(this._game);
  }

  //update debug visuals based on local entities
  _UpdateDebug(local) {
    this._lineRenderer.Reset();
    this._lineRenderer.Add(
        this.Position, this.Position.clone().add(this._velocity),
        0xFFFFFF);
    for (const e of local) {
      this._lineRenderer.Add(this.Position, e.Position, 0x00FF00); //Draw lines to local entities
    }
  }

  get Position() {
    return this._group.position; //Get the position of the boid 
  }

  get Velocity() {
    return this._velocity; //Get velocity of the boid
  }

  get Direction() {
    return this._direction; //Get the direction of the boid
  }

  get Radius() {
    return this._radius; //Get radius (size) of boid
  }

 

  Step(timeInSeconds) { //Main update function for each step of simulation
 
    const local = this._game._visibilityGrid.GetLocalEntities(
        this.Position, 15);

    this._ApplySteering(timeInSeconds, local);

    //update boids position based on velocity
    const frameVelocity = this._velocity.clone();
    frameVelocity.multiplyScalar(timeInSeconds);
    this._group.position.add(frameVelocity);

       // Define new half-size boundaries
       const boundaryMin = new THREE.Vector3(-50, -70, -100);
       const boundaryMax = new THREE.Vector3( 50, 90, 100);
   
       // Call boundary checking and correction
       this._ApplyBoundaryForce(boundaryMin, boundaryMax);
       
    //update rotation to face movement direction 
    const direction = this.Direction;
    const m = new THREE.Matrix4();
    m.lookAt(
        new THREE.Vector3(0, 0, 0),
        direction,
        new THREE.Vector3(0, 1, 0));
    this._group.quaternion.setFromRotationMatrix(m);

    // update visibility grid for the boids position 
    this._visibilityIndex = this._game._visibilityGrid.UpdateItem(
        this._mesh.uuid, this, this._visibilityIndex);

    //if debugging is enabled, update debug visuals  
    if (this._displayDebug) {
      this._UpdateDebug(local);
    }
  }

    // Method to keep boids within a given boundary
    _ApplyBoundaryForce(boundaryMin, boundaryMax) {
      const correctionForce = new THREE.Vector3();
  
      // Check each axis and apply a force inward if near boundary
      if (this.Position.x < boundaryMin.x) {
        correctionForce.x = (boundaryMin.x - this.Position.x) * 0.1;
      } else if (this.Position.x > boundaryMax.x) {
        correctionForce.x = (boundaryMax.x - this.Position.x) * 0.1;
      }
  
      if (this.Position.y < boundaryMin.y) {
        correctionForce.y = (boundaryMin.y - this.Position.y) * 0.1;
      } else if (this.Position.y > boundaryMax.y) {
        correctionForce.y = (boundaryMax.y - this.Position.y) * 0.1;
      }
  
      if (this.Position.z < boundaryMin.z) {
        correctionForce.z = (boundaryMin.z - this.Position.z) * 0.1;
      } else if (this.Position.z > boundaryMax.z) {
        correctionForce.z = (boundaryMax.z - this.Position.z) * 0.1;
      }
  
      // Apply the correction force to the boid’s velocity
      this._velocity.add(correctionForce);
    }
 
  //Apply various steering behaviours to the boid
  _ApplySteering(timeInSeconds, local) {
    const forces = [
      this._ApplySeek(this._game.target.position),
      this._ApplyWander(),
      this._ApplyGroundAvoidance(),
      this._ApplySeparation(local),
    ];

    // If the boid is small enough, apply additional behaviours like alignment and cohesion
    if (this._radius < 5) {
      // Only apply alignment and cohesion to similar sized fish.
      local = local.filter((e) => {
        const ratio = this.Radius / e.Radius;

        return (ratio <= 1.35 && ratio >= 0.75);
      });

      forces.push(
        this._ApplyAlignment(local),
        this._ApplyCohesion(local),
        this._ApplySeparation(local)
      )
    }

    const steeringForce = new THREE.Vector3(0, 0, 0);
    for (const f of forces) {
      steeringForce.add(f);
    } //combine all forces

    //Apply acceleration  of steering force
    steeringForce.multiplyScalar(this._acceleration * timeInSeconds);

    //  move in x/z dimension
    steeringForce.multiply(new THREE.Vector3(1, 0.25, 1));

    // Clamp the force applied
    if (steeringForce.length() > this._maxSteeringForce) {
      steeringForce.normalize();
      steeringForce.multiplyScalar(this._maxSteeringForce);
    }

    this._velocity.add(steeringForce); //Apply the steering force to the boids velocity

    // Clamp velocity if it exceeds maximum speed
    if (this._velocity.length() > this._maxSpeed) {
      this._velocity.normalize();
      this._velocity.multiplyScalar(this._maxSpeed);
    }

    this._direction = this._velocity.clone();
    this._direction.normalize();
  }

  //Apply different steering behaviour (e.g. seeking the origin, wandering, etc )
  _ApplyGroundAvoidance() {
    const p = this.Position;
    let force = new THREE.Vector3(0, 0, 0);

    if (p.y < 10) {
      force = new THREE.Vector3(0,0 , 0);
    } else if (p.y > 30) {
      force = new THREE.Vector3(0, 0, 0);
    }
    return force.multiplyScalar(_BOID_FORCE_SEPARATION);
  }

  _ApplyWander() { // Apply wander force to simulate random movement

    //randomly adjust the wander angle within a specified range 
    this._wanderAngle += 0.1 * math.rand_range(-2 * Math.PI, 2 * Math.PI);
    //get a random point on a circle using the updated wander angle 
    const randomPointOnCircle = new THREE.Vector3(
        Math.cos(this._wanderAngle),
        0,
        Math.sin(this._wanderAngle));
     //calculate a point ahead based on the boids current direction
    const pointAhead = this._direction.clone();
    pointAhead.multiplyScalar(2);
    pointAhead.add(randomPointOnCircle);
    //Normalize the direction and apply a scaling force
    pointAhead.normalize();
    return pointAhead.multiplyScalar(_BOID_FORCE_WANDER);
  }

  //Apply separation force to avoid crowding from other boids
  _ApplySeparation(local) {
    //If no nearby boids, return a zero vector
    if (local.length == 0) {
      return new THREE.Vector3(0, 0, 0);
    }

    const forceVector = new THREE.Vector3(0, 0, 0);
    //iterate through all nearby boids
    for (let e of local) {
      //calculate distance and adjust for radius
      const distanceToEntity = Math.max(
          e.Position.distanceTo(this.Position) - 1.5 * (this.Radius + e.Radius),
          0.001);
          //find the direction from other boid
      const directionFromEntity = new THREE.Vector3().subVectors(
          this.Position, e.Position);
          //scale the force based on distance and boids radius
      const multiplier = (
          _BOID_FORCE_SEPARATION / distanceToEntity) * (this.Radius + e.Radius);
      directionFromEntity.normalize();
      //Apply the force to seperate from other boids
      forceVector.add(
          directionFromEntity.multiplyScalar(multiplier));
    }
    return forceVector;
  }

  //Apply alignment force to align with the direction of nearby boids
  _ApplyAlignment(local) {
    const forceVector = new THREE.Vector3(0, 0, 0);

    //sun the directions of all nearby boids
    for (let e of local) {
      const entityDirection = e.Direction;
      forceVector.add(entityDirection);
    }

    //noramlise the resulting direction and apply scaling force
    forceVector.normalize();
    forceVector.multiplyScalar(_BOID_FORCE_ALIGNMENT);

    return forceVector;
  }
//apply cohesion force to steer toward the average position of nearby boids
  _ApplyCohesion(local) {
    const forceVector = new THREE.Vector3(0, 0, 0);
//if no nearby boids, return a zero vector
    if (local.length == 0) {
      return forceVector;
    }
// calculate the average position of nearby boids
    const averagePosition = new THREE.Vector3(0, 0, 0);
    for (let e of local) {
      averagePosition.add(e.Position);
    }

    averagePosition.multiplyScalar(1.0 / local.length);
   //Find direction to the averageposition and apply scaling force
    const directionToAveragePosition = averagePosition.clone().sub(
        this.Position);
    directionToAveragePosition.normalize();
    directionToAveragePosition.multiplyScalar(_BOID_FORCE_COHESION);

    return directionToAveragePosition;
  }
//Apply seek force to move towards a target (destination)
_ApplySeek(destination) {
  const direction = destination.clone().sub(this.Position); // Direction to the target
  const distance = Math.max(0, (direction.length() - 50) / 250) ** 2; // Scaled distance factor

  direction.normalize();
  const forceVector = direction.multiplyScalar(
      Math.max(_BOID_FORCE_ORIGIN * distance, 100.0)); // Ensure minimum force
  
  return forceVector;
}
}class Target {
  constructor(initialPosition, game) {
    this.position = initialPosition.clone();
    this.targetPosition = this.position.clone(); // Store target position for smooth movement
    this.angle = 0;
    this.radius = 1;  // Radius for X-axis
    this.yRadius = 1; // Radius for Y-axis (added this)
    this.angularSpeed = 1;
    this.verticalSpeed = 5;
    this.verticalAmplitude = 5;  // Define vertical amplitude
    this.game = game;

    // Debug sphere
    const geometry = new THREE.SphereGeometry(1, 16, 16);
    const material = new THREE.MeshBasicMaterial({ 
      transparent: true, 
      color: 0xff0000,
      opacity: 0.5 // Set to visible opacity
    });
    this.debugMesh = new THREE.Mesh(geometry, material);
    this.game._graphics.Scene.add(this.debugMesh);

    // Set an interval to randomize the radius every 30 seconds (30000 ms)
    setInterval(() => this.randomizeRadius(), 30 );

    // Start updating the position
    this.updatePosition(); 
  }

  mapValue(value, inMin, inMax, outMin, outMax) {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
  }

  randomizeRadius() {
    // Randomize the radius between 1 and 5 for both X and Y axes
    this.radius = Math.random() * 40  + 10; // Random number between 1 and 5 for X-axis
    this.yRadius = Math.random() * 200 + 10; // Random number between 1 and 5 for Y-axis
    console.log(`New radius X: ${this.radius}, New radius Y: ${this.yRadius}`); // Log the new radius for debugging
  }

  updatePosition(deltaTime = 0.016) {
    // Ensure radius is valid
    if (isNaN(this.radius) || this.radius <= 0 || isNaN(this.yRadius) || this.yRadius <= 0) {
      console.warn('Invalid radius, skipping update');
      return; // Skip update if radius is invalid
    }

    // Update angle for spiral movement
    this.angle += this.angularSpeed * deltaTime;
    if (isNaN(this.angle)) {
      console.error("Angle is NaN; resetting to 0");
      this.angle = 0;
    }

    // Calculate the target position (spiral path) on both axes
    const x = this.radius * Math.cos(this.angle);
    const z = this.radius * Math.sin(this.angle);
    const y = this.yRadius * Math.sin(this.angle); // Using yRadius for vertical movement

    // Store the new target position
    this.targetPosition.set(x, y, z);

    // Interpolate the current position to the target position
    const moveSpeed = 0.005; // This determines the speed of the movement
    this.position.lerp(this.targetPosition, moveSpeed); // Smoothly interpolate towards the target position

    // Update the debug mesh position
    if (this.debugMesh) {
      this.debugMesh.position.copy(this.position);
    }

    // Request the next frame
    requestAnimationFrame(() => this.updatePosition());
  }
}


//FishDemo class extends a base game class to manage the boid simulation 
class FishDemo extends game.Game {
  constructor() {
    super(); //call the parent constructor
  }

  //initialisation method to set up the scene and load the resources
  _OnInitialize() { 
    this._entities = [];

    this.target = new Target(new THREE.Vector3(0, 0, 0), this);
    //set background fog for the scene (creating underwater effect)
    this._graphics.Scene.fog = new THREE.FogExp2(new THREE.Color(0x4d7dbe), 0.001);
   
    //load background texture image
    this._LoadBackground();
 
        loader.load('./resources/white.glb', (gltf) => {
          if (gltf && gltf.scene) {
            console.log('GLTF model loaded');
           
            
            // Find fishes mesh and materials
            let fishMesh = null;
            gltf.scene.traverse((child) => {
              if (child.isMesh) {
                console.log('Found mesh:', child);  // Log found mesh
                fishMesh = child;
              }
            });
        
            // If a mesh and material are found, pass to _CreateBoid
            if (fishMesh && fishMesh.material) {
              const fishMaterial = fishMesh.material;
              console.log('Using material:', fishMaterial);
        
              //  Create boids using mesh and material from fish model
              this._CreateBoids(fishMesh.geometry, fishMaterial); 
            } else {
              console.error('No material found in the fish mesh.');
            }
    
            const boundaryMin = new THREE.Vector3(-400, 5, -400);
            const boundaryMax = new THREE.Vector3(400, 500, 400);
        
            // // Set up animations if available
            // this._setUpAnimations(gltf);
          } else {
            console.error('Failed to load the model!');
          }
        }, undefined, (error) => {
          console.error('Error loading GLTF model:', error);
        });
        
       
    //create entities like plane and grif
    this._CreateEntities();

      // Set up fixed camera (e.g., 50 units above the origin, facing down)
  this._graphics._camera.position.set(200, 0, 2); // Set camera position at a fixed height above the origin
  this._graphics._camera.lookAt(new THREE.Vector3(0, 60, 0)); // Look at the origin

  
  }

  //;pad background texture (underwater scene)
   _LoadBackground() {
  const loader = new THREE.TextureLoader();
  const texture = loader.load('./resources/Invert.jpg');
  
  this._graphics._scene.background = texture;

//  this._graphics._scene.background = new THREE.Color(0x000000);
  // Add ambient light for soft lighting in the scene
  const light = new THREE.AmbientLight(0x404040, 1); // (color, intensity)
  this._graphics._scene.add(light);
    
  }

  //create entities for simulation ( eg groud plane)
  _CreateEntities() {

    //create ground place with a specific material
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 400, 32, 32),
        new THREE.MeshStandardMaterial({
            color: 0x837860, //set colour etc
            transparent: true,
            opacity: 0 ,
        }));
    plane.position.set(0, -5, 0); //postion plane
    plane.castShadow = false; // Disable shadow casting 
    plane.receiveShadow = true; // Enable shadow recieving 
    plane.rotation.x = -Math.PI / 2; //Rotate plane to lay flat
    this._graphics.Scene.add(plane); //Add plane to scene

    //Initisalise visibility grid to manage entity position in the scene
    this._visibilityGrid = new visibility.VisibilityGrid(
        [new THREE.Vector3(-500, 0, -500), new THREE.Vector3(500, 0, 500)],
        [100, 100]);

  }


  // create boids based on geometry and material 
  _CreateBoids(fishGeometry, fishMaterial) {
    const NUM_BOIDS = 100;
  

    //parameteres to control the boids behaviour
    let params = {
      geometry: fishGeometry,  // Use the loaded geometry here
      material: fishMaterial,  // Pass the loaded material here
      speedMin: 3.0,
      speedMax: 4.0,
      speed: _BOID_SPEED,
      maxSteeringForce: _BOID_FORCE_MAX,
      acceleration: _BOID_ACCELERATION,
      colour: 0x80FF80,  // Default color as fallback
    };
    console.log('Creating boids with geometry:', fishGeometry);
  
    // Create the boids by instantiating the boid class
    for (let i = 0; i < NUM_BOIDS; i++) {
      const e = new Boid(this, params); //create boid entity 
      this._entities.push(e); // add it to the entity list
    }
  }
   

    // Step function to update the simulation each frame
  _OnStep(timeInSeconds) {
 
    //Limit the time step to a maximum value for stability, preventing jumps in time
    timeInSeconds = Math.min(timeInSeconds, 1 / 10.0);

    if (this._entities.length == 0) { //if there are no entities in the scene skip further calculation 
      return;
    }
 
 
for (let e of this._entities) {
  e.Step(timeInSeconds);
}

 

  }
}


 


// Call the function to fetch the singing state
// setInterval(getSingingState, 5000);
 
//Main entry point for the application
function _Main() {
  //Create an instance of Fish DEmo, this set up simulation
  _APP = new FishDemo();
}
//start simulation by calling the main function 
_Main();



//THINGS TO DO: 

//I want the height of the spiral to be based upon the value of the volume 

//c:\Users\charl\Desktop\Machine_Learning\Code\Fish-Tank\resources\white.glb
