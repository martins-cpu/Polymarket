FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Install global tools if needed (optional, npm scripts handle it)
# RUN npm install -g ts-node

# Copy source code
COPY . .

# Build step (optional if using ts-node, but good for checking errors)
# RUN npm run build 

# Start command
# We use the script from package.json
CMD ["npm", "start"]
