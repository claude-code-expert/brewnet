/**
 * Brewnet CLI — Docker Manager (T025)
 *
 * Manages Docker daemon interactions, container lifecycle,
 * and docker-compose generation.
 *
 * Uses `dockerode` to communicate with the Docker Engine API.
 *
 * @module services/docker-manager
 */

import Dockerode from 'dockerode';
import { BrewnetError } from '../utils/errors.js';

/**
 * Result of a Docker availability check.
 */
export interface DockerAvailabilityResult {
  available: true;
}

/**
 * Options for creating a DockerManager instance.
 */
export interface DockerManagerOptions {
  /** Custom dockerode instance (useful for testing). */
  docker?: Dockerode;
}

/**
 * Check whether the Docker daemon is reachable.
 *
 * @param options - Optional configuration (e.g. a custom Dockerode instance).
 * @returns `{ available: true }` when the daemon responds to a ping.
 * @throws {BrewnetError} BN001 when the Docker daemon is not running.
 */
export async function checkDockerAvailability(
  options?: DockerManagerOptions,
): Promise<DockerAvailabilityResult> {
  const docker = options?.docker ?? new Dockerode();

  try {
    await docker.ping();
    return { available: true };
  } catch {
    throw BrewnetError.dockerNotRunning();
  }
}
