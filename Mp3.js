
/**
 * @file A simple WebGL example for viewing meshes read from OBJ files
 * @author Jerry Chang <jerryc2@illinois.edu>  
 */

/** @global The WebGL context */
var gl;

/** @global The HTML5 canvas we draw on */
var canvas;

/** @global A simple GLSL shader program */
var shaderProgram;

/** @global The Modelview matrix */
var mvMatrix = mat4.create();

/** @global The View matrix */
var vMatrix = mat4.create();

/** @global The Projection matrix */
var pMatrix = mat4.create();

/** @global The Normal matrix */
var nMatrix = mat3.create();

/** @global The matrix stack for hierarchical modeling */
var mvMatrixStack = [];

/** @global An object holding the geometry for a 3D mesh */
var myMesh;

let rotate_track =0;
let scale_vec = vec3.create();
let translate_vec = vec3.create();
// View parameters
/** @global Location of the camera in world coordinates */
var eyePt = vec3.fromValues(0.0,0.0,2.0);
/** @global Direction of the view in world coordinates */
var viewDir = vec3.fromValues(0.0,0.0,-1.0);
/** @global Up vector for view matrix creation, in world coordinates */
var up = vec3.fromValues(0.0,1.0,0.0);
/** @global Location of a point along viewDir in world coordinates */
var viewPt = vec3.fromValues(0.0,0.0,0.0);

//Light parameters
/** @global Light position in VIEW coordinates */
var lightPosition = [0,5,5];
/** @global Ambient light color/intensity for Phong reflection */
var lAmbient = [0,0,0];
/** @global Diffuse light color/intensity for Phong reflection */
var lDiffuse = [1,1,1];
/** @global Specular light color/intensity for Phong reflection */
var lSpecular =[1,1,1];

//Material parameters
/** @global Ambient material color/intensity for Phong reflection */
var kAmbient = [1.0,1.0,1.0];
/** @global Diffuse material color/intensity for Phong reflection */
var kTerrainDiffuse = [205.0/255.0,163.0/255.0,63.0/255.0];
/** @global Specular material color/intensity for Phong reflection */
var kSpecular = [0.0,0.0,0.0];
/** @global Shininess exponent for Phong reflection */
var shininess = 23;
/** @global Edge color fpr wireframeish rendering */
var kEdgeBlack = [0.0,0.0,0.0];
/** @global Edge color for wireframe rendering */
var kEdgeWhite = [1.0,1.0,1.0];


//Model parameters
var eulerY=0;

//-------------------------------------------------------------------------
/**
 * Asynchronously read a server-side text file
 * Input: URL of file
 * Output: File fetched from url to be used
 * Returns: NONE
 */
function asyncGetFile(url) {
  //Your code here
    console.log("Getting Text File");
    return new Promise((resolve, reject)=>{
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url);
      xhr.onload = () => resolve(xhr.responseText);
      xhr.onerror = () => reject(xhr.statusText);
      xhr.send();
      console.log("Made Promise");
    });
}

//-------------------------------------------------------------------------
/**
 * Sends Modelview matrix to shader
 */
function uploadModelViewMatrixToShader() {
  gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, mvMatrix);
}

//-------------------------------------------------------------------------
/**
 * Sends projection matrix to shader
 */
function uploadProjectionMatrixToShader() {
  gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, 
                      false, pMatrix);
}

//-------------------------------------------------------------------------
/**
 * Generates and sends the normal matrix to the shader
 */
function uploadNormalMatrixToShader() {
  mat3.fromMat4(nMatrix,mvMatrix);
  mat3.transpose(nMatrix,nMatrix);
  mat3.invert(nMatrix,nMatrix);
  gl.uniformMatrix3fv(shaderProgram.nMatrixUniform, false, nMatrix);
}

//----------------------------------------------------------------------------------
/**
 * Pushes matrix onto modelview matrix stack
 */
function mvPushMatrix() {
    var copy = mat4.clone(mvMatrix);
    mvMatrixStack.push(copy);
}


//----------------------------------------------------------------------------------
/**
 * Pops matrix off of modelview matrix stack
 */
function mvPopMatrix() {
    if (mvMatrixStack.length == 0) {
      throw "Invalid popMatrix!";
    }
    mvMatrix = mvMatrixStack.pop();
}

//----------------------------------------------------------------------------------
/**
 * Sends projection/modelview matrices to shader
 */
function setMatrixUniforms() {
    uploadModelViewMatrixToShader();
    uploadNormalMatrixToShader();
    uploadProjectionMatrixToShader();
}

//----------------------------------------------------------------------------------
/**
 * Translates degrees to radians
 * @param {Number} degrees Degree input to function
 * @return {Number} The radians that correspond to the degree input
 */
function degToRad(degrees) {
        return degrees * Math.PI / 180;
}

//----------------------------------------------------------------------------------
/**
 * Creates a context for WebGL
 * @param {element} canvas WebGL canvas
 * @return {Object} WebGL context
 */
function createGLContext(canvas) {
  var names = ["webgl", "experimental-webgl"];
  var context = null;
  for (var i=0; i < names.length; i++) {
    try {
      context = canvas.getContext(names[i]);
    } catch(e) {}
    if (context) {
      break;
    }
  }
  if (context) {
    context.viewportWidth = canvas.width;
    context.viewportHeight = canvas.height;
  } else {
    alert("Failed to create WebGL context!");
  }
  return context;
}

//----------------------------------------------------------------------------------
/**
 * Loads Shaders
 * @param {string} id ID string for shader to load. Either vertex shader/fragment shader
 */
function loadShaderFromDOM(id) {
  var shaderScript = document.getElementById(id);
  
  // If we don't find an element with the specified id
  // we do an early exit 
  if (!shaderScript) {
    return null;
  }
  
  // Loop through the children for the found DOM element and
  // build up the shader source code as a string
  var shaderSource = "";
  var currentChild = shaderScript.firstChild;
  while (currentChild) {
    if (currentChild.nodeType == 3) { // 3 corresponds to TEXT_NODE
      shaderSource += currentChild.textContent;
    }
    currentChild = currentChild.nextSibling;
  }
 
  var shader;
  if (shaderScript.type == "x-shader/x-fragment") {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type == "x-shader/x-vertex") {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;
  }
 
  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);
 
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  } 
  return shader;
}

//----------------------------------------------------------------------------------
/**
 * Setup the fragment and vertex shaders
 */
function setupShaders() {
  vertexShader = loadShaderFromDOM("shader-vs");
  fragmentShader = loadShaderFromDOM("shader-fs");
  
  shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert("Failed to setup shaders");
  }

  gl.useProgram(shaderProgram);

  shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
  gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);

  shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "aVertexNormal");
  gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);

  shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
  shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
  shaderProgram.nMatrixUniform = gl.getUniformLocation(shaderProgram, "uNMatrix");
  shaderProgram.uniformLightPositionLoc = gl.getUniformLocation(shaderProgram, "uLightPosition");    
  shaderProgram.uniformAmbientLightColorLoc = gl.getUniformLocation(shaderProgram, "uAmbientLightColor");  
  shaderProgram.uniformDiffuseLightColorLoc = gl.getUniformLocation(shaderProgram, "uDiffuseLightColor");
  shaderProgram.uniformSpecularLightColorLoc = gl.getUniformLocation(shaderProgram, "uSpecularLightColor");
  shaderProgram.uniformShininessLoc = gl.getUniformLocation(shaderProgram, "uShininess");    
  shaderProgram.uniformAmbientMaterialColorLoc = gl.getUniformLocation(shaderProgram, "uKAmbient");  
  shaderProgram.uniformDiffuseMaterialColorLoc = gl.getUniformLocation(shaderProgram, "uKDiffuse");
  shaderProgram.uniformSpecularMaterialColorLoc = gl.getUniformLocation(shaderProgram, "uKSpecular");
}


//----------------------------------------------------------------------------------
/**
 * Setup the fragment and vertex shaders for reflection
 */
function setupReflectShaders() {
  vertexShader = loadShaderFromDOM("reflect-shader-vs");
  fragmentShader = loadShaderFromDOM("reflect-shader-fs");
  
  shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert("Failed to setup shaders");
  }

  gl.useProgram(shaderProgram);

  shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
  gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);

  shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "aVertexNormal");
  gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);

  shaderProgram.projectionLocation = gl.getUniformLocation(shaderProgram, "uPMatrix");
  shaderProgram.viewLocation = gl.getUniformLocation(shaderProgram, "uvMatrix");
  shaderProgram.worldLocation = gl.getUniformLocation(shaderProgram, "uMVMatrix");
  shaderProgram.textureLocation = gl.getUniformLocation(shaderProgram, "u_texture");
  shaderProgram.worldCameraPositionLocation = gl.getUniformLocation(shaderProgram, "u_worldCameraPosition");
}

//----------------------------------------------------------------------------------
/**
 * Setup the fragment and vertex shaders for refraction
 */
function setupRefractShaders() {
  vertexShader = loadShaderFromDOM("refract-shader-vs");
  fragmentShader = loadShaderFromDOM("refract-shader-fs");
  
  shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert("Failed to setup shaders");
  }

  gl.useProgram(shaderProgram);

  shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
  gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);

  shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "aVertexNormal");
  gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);

  shaderProgram.projectionLocation = gl.getUniformLocation(shaderProgram, "uPMatrix");
  shaderProgram.viewLocation = gl.getUniformLocation(shaderProgram, "uvMatrix");
  shaderProgram.worldLocation = gl.getUniformLocation(shaderProgram, "uMVMatrix");
  shaderProgram.textureLocation = gl.getUniformLocation(shaderProgram, "u_texture");
  shaderProgram.worldCameraPositionLocation = gl.getUniformLocation(shaderProgram, "u_worldCameraPosition");
}

// //----------------------------------------------------------------------------------
// /**
//  * Setup the fragment and vertex shaders for Skybox
//  */
// function setupSkyboxShaders() {
//   vertexShader = loadShaderFromDOM("skybox-shader-vs");
//   fragmentShader = loadShaderFromDOM("skybox-shader-fs");
  
//   shaderProgram = gl.createProgram();
//   gl.attachShader(shaderProgram, vertexShader);
//   gl.attachShader(shaderProgram, fragmentShader);
//   gl.linkProgram(shaderProgram);

//   if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
//     alert("Failed to setup shaders");
//   }

//   gl.useProgram(shaderProgram);

//   shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
//   gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);

//   shaderProgram.skyboxLocation = gl.getUniformLocation(shaderProgram, "u_skybox");
//   shaderProgram.viewDirectionProjectionInverseLocation = gl.getUniformLocation(shaderProgram, "u_viewDirectionProjectionInverse");
// }

//-------------------------------------------------------------------------
/**
 * Sends material information to the shader
 * @param {Float32} alpha shininess coefficient
 * @param {Float32Array} a Ambient material color
 * @param {Float32Array} d Diffuse material color
 * @param {Float32Array} s Specular material color
 */
function setMaterialUniforms(alpha,a,d,s) {
  gl.uniform1f(shaderProgram.uniformShininessLoc, alpha);
  gl.uniform3fv(shaderProgram.uniformAmbientMaterialColorLoc, a);
  gl.uniform3fv(shaderProgram.uniformDiffuseMaterialColorLoc, d);
  gl.uniform3fv(shaderProgram.uniformSpecularMaterialColorLoc, s);
}

//-------------------------------------------------------------------------
/**
 * Sends light information to the shader
 * @param {Float32Array} loc Location of light source
 * @param {Float32Array} a Ambient light strength
 * @param {Float32Array} d Diffuse light strength
 * @param {Float32Array} s Specular light strength
 */
function setLightUniforms(loc,a,d,s) {
  gl.uniform3fv(shaderProgram.uniformLightPositionLoc, loc);
  gl.uniform3fv(shaderProgram.uniformAmbientLightColorLoc, a);
  gl.uniform3fv(shaderProgram.uniformDiffuseLightColorLoc, d);
  gl.uniform3fv(shaderProgram.uniformSpecularLightColorLoc, s);
}

//----------------------------------------------------------------------------------
/**
 * Populate buffers with data
 * Input: filename of file to be parsed
 * Output: Uses asyncGetFile to fetch .obj file, then give to TriMesh object to parse
 * Returns: NONE
 */
function setupMesh(filename) {
   //Your code here
   myMesh = new TriMesh();
   myPromise = asyncGetFile(filename);
   //We define what to do when the promise is resolved with the then() call,
   //and what to do when the promise is rejected with the catch() call
   myPromise.then((retrievedText) => {
      myMesh.loadFromOBJ(retrievedText);
      console.log("YAY! we got the file!");
      scale_vec = vec3.fromValues((1/mid_dist), (1/mid_dist), (1/mid_dist));
      translate_vec = vec3.fromValues(x_mid, y_mid, z_mid);

   })
    .catch((reason) => {    //log the rejection reason
        console.log('Handle rejected Promise ('+reason+') here.');
    }); 
  }

//----------------------------------------------------------------------------------
/**
 * Draw call that applies matrix transformations to model and draws model in frame
 */
function draw() { 
    //console.log("function draw()")
  
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // We'll use perspective 
    mat4.perspective(pMatrix,degToRad(45), 
                     gl.viewportWidth / gl.viewportHeight,
                     0.1, 500.0);

    // We want to look down -z, so create a lookat point in that direction    
    //vec3.add(viewPt, eyePt, viewDir);
    
    // Then generate the lookat matrix and initialize the view matrix to that view

    mat4.lookAt(vMatrix,eyePt,viewPt,up);
    //let rotate_around = vec3.create();
    // eyePt = vec3.fromValues(Math.cos(eulerY), 0, Math.sin(eulerY));
    //eyePt = vec3.add(eyePt, eyePt, rotate_around);
    
    //Draw Mesh
    //ADD an if statement to prevent early drawing of myMesh
//     let viewDirectionProjectionMatrix = mat4.create();
//     mat4.multiply(viewDirectionProjectionMatrix, pMatrix, vMatrix);
//     let viewDirectionProjectionInverseMatrix = mat4.create();
//     mat4.invert(viewDirectionProjectionInverseMatrix, viewDirectionProjectionMatrix);
 
// // Set the uniforms
// gl.uniformMatrix4fv(shaderProgram.viewDirectionProjectionInverseLocation, false, viewDirectionProjectionInverseMatrix);
 
// // Tell the shader to use texture unit 0 for u_skybox
// gl.uniform1i(skyboxLocation, 0);
    if(myMesh.loaded()){    //change matrices values IF myMesh has new mesh data
        mvPushMatrix();
        if(rotate_track == 1){                          //Turn the camera's viewpoint around the teapot
          vec3.rotateY(eyePt, eyePt, viewPt, degToRad(0.45));
        }
        if(rotate_track == 2){
          vec3.rotateY(eyePt, eyePt, viewPt, -degToRad(0.45));
        }
        mat4.rotateY(mvMatrix, mvMatrix, degToRad(eulerY));       //rotate the modelViewMatrix for teapot rotation
        mat4.multiply(mvMatrix,vMatrix,mvMatrix);
        mat4.scale(mvMatrix, mvMatrix, scale_vec);
        mat4.translate(mvMatrix, mvMatrix, translate_vec);
    
        if (document.getElementById("polygon").checked)
        {
            setMatrixUniforms();
            setLightUniforms(lightPosition,lAmbient,lDiffuse,lSpecular);
            setMaterialUniforms(shininess,kAmbient,
                                kTerrainDiffuse,kSpecular); 
            
            myMesh.drawTriangles();
        }
    
        if(document.getElementById("reflection").checked)
        {   
                  // Set the uniforms
          gl.uniformMatrix4fv(shaderProgram.projectionLocation, false, pMatrix);
          gl.uniformMatrix4fv(shaderProgram.viewLocation, false, vMatrix);
          gl.uniformMatrix4fv(shaderProgram.worldLocation, false, mvMatrix);
          gl.uniform3fv(shaderProgram.worldCameraPositionLocation, eyePt);
          myMesh.drawTriangles();
        }   

        if(document.getElementById("refraction").checked)
        {
          // Set the uniforms
          gl.uniformMatrix4fv(shaderProgram.projectionLocation, false, pMatrix);
          gl.uniformMatrix4fv(shaderProgram.viewLocation, false, vMatrix);
          gl.uniformMatrix4fv(shaderProgram.worldLocation, false, mvMatrix);
          gl.uniform3fv(shaderProgram.worldCameraPositionLocation, eyePt);
          myMesh.drawTriangles();
        }   
 
// Tell the shader to use texture unit 0 for u_texture
gl.uniform1i(shaderProgram.textureLocation, 0);
        mvPopMatrix();
    }
  
}

//----------------------------------------------------------------------------------
//Code to handle user interaction
var currentlyPressedKeys = {};

function handleKeyDown(event) {
        //console.log("Key down ", event.key, " code ", event.code);
        currentlyPressedKeys[event.key] = true;
          if (currentlyPressedKeys["a"]) {              //rotate the TEAPOT
            // key A
            eulerY-= 1;
        } else if (currentlyPressedKeys["d"]) {
            // key D
            eulerY+= 1;
        } 
    
        // if (currentlyPressedKeys["ArrowUp"]){               //zoom in and out
        //     // Up cursor key
        //     event.preventDefault();
        //     eyePt[2]+= 0.01;
        // } else if (currentlyPressedKeys["ArrowDown"]){
        //     event.preventDefault();
        //     // Down cursor key
        //     eyePt[2]-= 0.01;
        // } 
    
        if (currentlyPressedKeys["w"]) {            //rotate AROUND the teapot
          // key A
          //eulerY = 0.5;
          //vec3.rotateY(eyePt, eyePt, viewPt, degToRad(eulerY));
          rotate_track = 1;
          // eyePt[2] = 2*Math.cos(eulerY);
          // eyePt[0] = 2*Math.sin(eulerY);
      } else if (currentlyPressedKeys["r"]) {
          // key D
          //eulerY = 0.5;
          //vec3.rotateY(eyePt, eyePt, viewPt, -degToRad(eulerY));
          rotate_track =2;
          // eyePt[2] = 2*Math.cos(eulerY);
          // eyePt[0] = 2*Math.sin(eulerY);
      } 

}

function handleKeyUp(event) {
        //console.log("Key up ", event.key, " code ", event.code);
        currentlyPressedKeys[event.key] = false;
        rotate_track = 0;     //reset rotation variable
}

//----------------------------------------------------------------------------------
/**
 * Startup function called from html code to start program.
 */
 function startup() {
  canvas = document.getElementById("myGLCanvas");
  gl = createGLContext(canvas);
  setupShaders();
  setupMesh("teapot_0.obj");
  setup_texture();
  //setupMesh("cow.obj");
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.enable(gl.DEPTH_TEST);
  document.onkeydown = handleKeyDown;
  document.onkeyup = handleKeyUp;
  tick();
}


//----------------------------------------------------------------------------------
/**
  * Update any model transformations
  */
function animate() {
   //console.log(eulerX, " ", eulerY, " ", eulerZ); 
   document.getElementById("eY").value=eulerY;
   //document.getElementById("eZ").value=eyePt[2];   
   if(document.getElementById("reflection").checked)
   {   
    setupReflectShaders();
   }
   if(document.getElementById("polygon").checked)
   {   
     setupShaders();
   }  
   if(document.getElementById("refraction").checked)
   {   
     setupRefractShaders();
   }  
}


//----------------------------------------------------------------------------------
/**
 * Keeping drawing frames....
 */
function tick() {
    requestAnimFrame(tick);
    //setupSkyboxShaders();
    animate();
    draw();
}

/*
*MAKE THE TEXTURES
*/ 

function setup_texture(){
// Create a texture.
var texture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
 
const faceInfos = [
  {
    target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, 
    url: 'London/pos-x.png',
  },
  {
    target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, 
    url: 'London/neg-x.png',
  },
  {
    target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, 
    url: 'London/pos-y.png',
  },
  {
    target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, 
    url: 'London/neg-y.png',
  },
  {
    target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, 
    url: 'London/pos-z.png',
  },
  {
    target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, 
    url: 'London/neg-z.png',
  },
];
faceInfos.forEach((faceInfo) => {
  const {target, url} = faceInfo;
 
  // Upload the canvas to the cubemap face.
  const level = 0;
  const internalFormat = gl.RGBA;
  const width = 512;
  const height = 512;
  const format = gl.RGBA;
  const type = gl.UNSIGNED_BYTE;
 
  // setup each face so it's immediately renderable
  gl.texImage2D(target, level, internalFormat, width, height, 0, format, type, null);
 
  // Asynchronously load an image
  const image = new Image();
  image.src = url;
  image.addEventListener('load', function() {
    // Now that the image has loaded make copy it to the texture.
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    gl.texImage2D(target, level, internalFormat, format, type, image);
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
  });
});
gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
}
