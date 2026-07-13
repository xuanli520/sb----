package cn.edu.training.globehello.web;

final class AsciiGlobeRenderer {

    static final int COLUMNS = 53;
    static final int ROWS = 27;

    private static final char[] WATER_SHADES = ".:-=+*".toCharArray();
    private static final char[] LAND_SHADES = "'oO#%@".toCharArray();

    private AsciiGlobeRenderer() {
    }

    static String render(int frame) {
        double rotation = frame * 0.105;
        StringBuilder globe = new StringBuilder((COLUMNS + 1) * ROWS);

        for (int row = 0; row < ROWS; row++) {
            double y = (row - (ROWS - 1) / 2.0) / ((ROWS - 1) / 2.0);

            for (int column = 0; column < COLUMNS; column++) {
                double x = (column - (COLUMNS - 1) / 2.0) / ((COLUMNS - 1) / 2.0);
                globe.append(renderCell(x, y, rotation, frame));
            }

            if (row < ROWS - 1) {
                globe.append('\n');
            }
        }

        return globe.toString();
    }

    private static char renderCell(double x, double y, double rotation, int frame) {
        double distanceSquared = x * x + y * y;
        if (distanceSquared > 1.0) {
            return ' ';
        }

        double z = Math.sqrt(1.0 - distanceSquared);
        double worldX = x * Math.cos(rotation) - z * Math.sin(rotation);
        double worldZ = x * Math.sin(rotation) + z * Math.cos(rotation);
        double longitude = Math.toDegrees(Math.atan2(worldX, worldZ));
        double latitude = Math.toDegrees(Math.asin(y));
        double illumination = clamp(0.16 + 0.84 * (x * 0.18 + y * 0.30 + z * 0.94), 0.0, 1.0);

        boolean land = isLand(longitude, latitude);
        boolean cloud = isCloud(longitude, latitude, frame);
        boolean grid = isGridLine(longitude, latitude);
        boolean rim = distanceSquared > 0.91;

        if (cloud && illumination > 0.34) {
            return illumination > 0.72 ? '~' : ',';
        }

        if (land) {
            return shade(LAND_SHADES, illumination);
        }

        if (grid && illumination > 0.22) {
            return illumination > 0.60 ? '+' : '-';
        }

        char water = shade(WATER_SHADES, illumination);
        if (rim && water == '.') {
            return '+';
        }
        return water;
    }

    private static boolean isLand(double longitude, double latitude) {
        if (latitude < -72.0) {
            return true;
        }

        return continent(longitude, latitude, -104.0, 50.0, 39.0, 27.0)
                || continent(longitude, latitude, -82.0, 17.0, 17.0, 17.0)
                || continent(longitude, latitude, -61.0, -17.0, 20.0, 38.0)
                || continent(longitude, latitude, -42.0, 72.0, 17.0, 13.0)
                || continent(longitude, latitude, -4.0, 51.0, 31.0, 15.0)
                || continent(longitude, latitude, 71.0, 47.0, 74.0, 36.0)
                || continent(longitude, latitude, 78.0, 20.0, 14.0, 18.0)
                || continent(longitude, latitude, 22.0, 6.0, 29.0, 39.0)
                || continent(longitude, latitude, 46.0, 25.0, 14.0, 13.0)
                || continent(longitude, latitude, 135.0, -25.0, 21.0, 16.0)
                || continent(longitude, latitude, 138.0, 37.0, 7.0, 11.0)
                || continent(longitude, latitude, 47.0, -20.0, 5.0, 12.0);
    }

    private static boolean continent(double longitude, double latitude, double centerLongitude, double centerLatitude,
                                     double longitudeRadius, double latitudeRadius) {
        double longitudeDistance = wrapLongitude(longitude - centerLongitude) / longitudeRadius;
        double latitudeDistance = (latitude - centerLatitude) / latitudeRadius;
        double coast = 0.13 * Math.sin(Math.toRadians(longitude * 4.7 + latitude * 3.1))
                + 0.08 * Math.cos(Math.toRadians(longitude * 8.3 - latitude * 5.2));
        return longitudeDistance * longitudeDistance + latitudeDistance * latitudeDistance < 1.0 + coast;
    }

    private static boolean isCloud(double longitude, double latitude, int frame) {
        if (Math.abs(latitude) > 67.0) {
            return false;
        }

        double drift = frame * 4.2;
        double formation = Math.sin(Math.toRadians(longitude * 3.2 + latitude * 1.4 + drift))
                + Math.sin(Math.toRadians(longitude * 6.1 - latitude * 2.6 - drift * 0.7))
                + Math.cos(Math.toRadians(latitude * 5.7 + drift * 0.45));
        return formation > 2.18;
    }

    private static boolean isGridLine(double longitude, double latitude) {
        double longitudeBand = Math.abs(Math.sin(Math.toRadians(longitude * 3.0)));
        double latitudeBand = Math.abs(Math.sin(Math.toRadians(latitude * 4.0)));
        return longitudeBand < 0.065 || latitudeBand < 0.052;
    }

    private static char shade(char[] shades, double illumination) {
        int index = (int) Math.round(illumination * (shades.length - 1));
        return shades[Math.max(0, Math.min(index, shades.length - 1))];
    }

    private static double wrapLongitude(double longitude) {
        double wrapped = longitude % 360.0;
        return wrapped > 180.0 ? wrapped - 360.0 : wrapped < -180.0 ? wrapped + 360.0 : wrapped;
    }

    private static double clamp(double value, double minimum, double maximum) {
        return Math.max(minimum, Math.min(value, maximum));
    }
}
