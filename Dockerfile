# Use official Node LTS image
FROM node:20-alpine

# Set working directory inside container
WORKDIR /usr/src/app

# Copy package files first (better layer caching)
COPY package*.json ./

# Install dependencies from the lockfile
RUN npm ci --omit=dev

# Copy rest of the app
COPY . .

# Expose the port your app runs on
EXPOSE 3000

# Start the app
CMD ["npm", "start"]